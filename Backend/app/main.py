import os
import json
import asyncio
import tempfile
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.schemas.payload import (
    QueryRequest,
    DocumentIngestResponse,
    ConversationCreate,
    ConversationTitleUpdate,
    ConversationListItem,
    ConversationDetail,
    MessageResponse,
    IngestedDocumentResponse,
)
from app.ingestion.pdf_processor import PDFIngestionEngine, compute_file_hash
from app.graph.nodes import vector_store_instance
from app.graph.workflow import rag_graph
from app.cache import RedisSemanticCache
from app.llm_manager import get_active_llm_model_name
from app.db.database import get_db, init_db
from app.db import crud
from app.auth import get_current_user_id

load_dotenv()

# ─── Rate Limiter ─────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Nexus-RAG Backend Engine", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Singletons ───────────────────────────────────────────────────────────────
ingestion_engine = PDFIngestionEngine()
semantic_cache = RedisSemanticCache()


@app.on_event("startup")
def on_startup():
    init_db()


# ─── Root ─────────────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"status": "online", "system": "Nexus-RAG Enterprise Engine v2.0"}


@app.get("/api/v1/health")
def health_check():
    """Connectivity check for all backend services."""
    import requests
    groq_api_key = os.getenv("GROQ_API_KEY", "")
    groq_ok = False
    try:
        r = requests.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {groq_api_key}"},
            timeout=4,
        )
        groq_ok = r.status_code == 200
    except Exception:
        pass

    redis_ok = semantic_cache.client is not None

    qdrant_ok = False
    try:
        vector_store_instance.client.get_collections()
        qdrant_ok = True
    except Exception:
        pass

    return {
        "status": "online",
        "services": {
            "groq_llm": "ok" if groq_ok else "unreachable",
            "qdrant": "ok" if qdrant_ok else "unreachable",
            "redis_cache": "ok" if redis_ok else "offline (pass-through mode)",
        },
    }


@app.get("/api/v1/models")
def list_available_models():
    """Returns available text generation LLM models on Groq for user selection."""
    groq_api_key = os.getenv("GROQ_API_KEY", "")
    from app.llm_manager import fetch_active_groq_models
    active_ids = fetch_active_groq_models(groq_api_key)
    
    default_models = [
        {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "tag": "Fast & Smart"},
        {"id": "qwen/qwen3.8-27b", "name": "Qwen 3.8 27B", "tag": "High Reasoning"},
        {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B", "tag": "Long Context"},
        {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B", "tag": "Ultra Fast"},
    ]
    
    if active_ids:
        # Filter or format dynamically
        result = []
        for m_id in active_ids:
            name = m_id.split("/")[-1].replace("-", " ").title()
            result.append({"id": m_id, "name": name, "tag": "Groq Active"})
        return result
        
    return default_models


@app.get("/api/v1/system/info")
def get_system_info():

    provider = os.getenv("VECTOR_STORE_PROVIDER", "qdrant").strip().lower()
    active_model = get_active_llm_model_name()
    hyde_enabled = os.getenv("HYDE_ENABLED", "true").strip().lower() in ["true", "1", "yes"]
    return {
        "status": "online",
        "system": "Nexus-RAG Enterprise Engine v2.0",
        "active_llm_model": active_model,
        "vector_provider": provider,
        "reranker_model": "rerank-english-v3.0",
        "hyde_enabled": hyde_enabled,
    }


# ─── Conversations ────────────────────────────────────────────────────────────

@app.get("/api/v1/conversations", response_model=List[ConversationListItem])
def list_conversations(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    convs = crud.list_conversations(db, user_id)
    result = []
    for c in convs:
        # Count user questions only so 1 Q&A turn = 1 query
        user_msg_count = len([m for m in c.messages if m.role == "user"])
        result.append(
            ConversationListItem(
                id=c.id,
                title=c.title,
                source_file=c.source_file,
                created_at=c.created_at,
                updated_at=c.updated_at,
                message_count=user_msg_count,
            )
        )
    return result


@app.post("/api/v1/conversations", response_model=ConversationListItem)
def create_conversation(payload: ConversationCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    conv = crud.create_conversation(db, user_id, title=payload.title or "New Conversation")
    return ConversationListItem(
        id=conv.id,
        title=conv.title,
        source_file=conv.source_file,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=0,
    )


@app.get("/api/v1/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    conv = crud.get_conversation(db, conversation_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = [
        MessageResponse(
            id=m.id,
            role=m.role,
            content=m.content,
            citations=json.loads(m.citations_json or "[]"),
            created_at=m.created_at,
        )
        for m in conv.messages
    ]
    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        source_file=conv.source_file,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=messages,
    )


@app.patch("/api/v1/conversations/{conversation_id}/title", response_model=ConversationListItem)
def rename_conversation(conversation_id: str, payload: ConversationTitleUpdate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    conv = crud.update_conversation_title(db, conversation_id, payload.title, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationListItem(
        id=conv.id,
        title=conv.title,
        source_file=conv.source_file,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=len([m for m in conv.messages if m.role == "user"]),
    )


@app.post("/api/v1/conversations/{conversation_id}/attach_document")
def attach_document_to_conversation(
    conversation_id: str, filename: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
):
    """Associates an existing ingested document with a conversation session."""
    conv = crud.update_conversation_source_file(db, conversation_id, filename, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "status": "attached",
        "conversation_id": conv.id,
        "source_file": conv.source_file,
        "title": conv.title,
    }


@app.delete("/api/v1/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    success = crud.delete_conversation(db, conversation_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted", "id": conversation_id}


# ─── Documents ────────────────────────────────────────────────────────────────

@app.get("/api/v1/documents", response_model=List[IngestedDocumentResponse])
def list_documents(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return crud.list_ingested_docs(db, user_id)


@app.delete("/api/v1/documents/{filename:path}")
def delete_document(filename: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    success = crud.delete_ingested_doc(db, filename, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document record not found")
    return {"status": "deleted", "filename": filename}


# ─── Ingest ───────────────────────────────────────────────────────────────────

@app.post("/api/v1/ingest", response_model=DocumentIngestResponse)
async def ingest_pdf(
    file: UploadFile = File(...),
    conversation_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Upload and process a PDF. Skips ingestion if identical file was already processed (MD5 check)."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    content = await file.read()
    file_hash = compute_file_hash(content)

    # If conversation_id is provided, associate PDF with this conversation session
    if conversation_id:
        crud.update_conversation_source_file(db, conversation_id, file.filename, user_id)

    # Duplicate detection
    existing = crud.doc_exists_by_hash(db, file_hash, user_id)
    if existing:
        return DocumentIngestResponse(
            status="duplicate",
            filename=existing.filename,
            parent_chunks_created=existing.parent_chunks,
            child_chunks_created=existing.child_chunks,
            message=f"Recognized existing document '{existing.filename}'. Embeddings ready for instant search!",
            duplicate=True,
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
        tmp_file.write(content)
        temp_path = tmp_file.name

    try:
        raw_docs = ingestion_engine.load_pdf(temp_path)
        parent_docs, child_docs = ingestion_engine.create_parent_child_chunks(raw_docs, file.filename)
        vector_store_instance.store_documents(parent_docs, child_docs, user_id)

        # Save to DB
        crud.save_ingested_doc(
            db,
            filename=file.filename,
            file_hash=file_hash,
            parent_chunks=len(parent_docs),
            child_chunks=len(child_docs),
            user_id=user_id,
        )

        return DocumentIngestResponse(
            status="success",
            filename=file.filename,
            parent_chunks_created=len(parent_docs),
            child_chunks_created=len(child_docs),
            message="Document successfully processed, indexed, and stored in Vector Store.",
            duplicate=False,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


# ─── Query Stream ─────────────────────────────────────────────────────────────

@app.post("/api/v1/query/stream")
@limiter.limit("30/minute")
async def stream_query(request: Request, payload: QueryRequest, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """SSE streaming endpoint. Checks Redis cache, executes RAG graph, saves to DB."""

    async def event_generator():
        try:
            source_file = None
            if payload.conversation_id:
                conv = crud.get_conversation(db, payload.conversation_id, user_id)
                if conv:
                    source_file = conv.source_file
                crud.add_message(db, payload.conversation_id, user_id, "user", payload.question)

            # 2. Check Redis Semantic Cache
            cached_result = semantic_cache.get_cached_response(payload.question)
            if cached_result:
                cached_generation, cached_citations, score = cached_result
                yield {"event": "citations", "data": json.dumps({"citations": cached_citations})}
                for word in cached_generation.split(" "):
                    yield {"event": "message", "data": json.dumps({"token": word + " "})}
                    await asyncio.sleep(0.01)
                # Save cached assistant response to DB
                if payload.conversation_id:
                    crud.add_message(db, payload.conversation_id, user_id, "assistant", cached_generation, cached_citations)
                yield {"event": "done", "data": "[DONE]"}
                return

            # 3. Cache Miss — Execute LangGraph RAG Workflow
            initial_state = {
                "question": payload.question,
                "model": payload.model,
                "source_file": source_file,
                "documents": [],
                "child_documents": [],
                "reranked_documents": [],
                "generation": "",
                "citation_sources": [],
                "error": None,
            }
            final_state = rag_graph.invoke(initial_state)
            citations = final_state.get("citation_sources", [])
            generation_text = final_state.get("generation", "No response generated.")

            yield {"event": "citations", "data": json.dumps({"citations": citations})}
            for word in generation_text.split(" "):
                yield {"event": "message", "data": json.dumps({"token": word + " "})}
                await asyncio.sleep(0.02)

            # 4. Save to Redis cache + DB
            if generation_text and not generation_text.startswith("Error"):
                semantic_cache.set_cached_response(payload.question, generation_text, citations)
            if payload.conversation_id:
                crud.add_message(db, payload.conversation_id, user_id, "assistant", generation_text, citations)

        except Exception as e:
            yield {"event": "message", "data": json.dumps({"token": f"\n\n[System Error]: {str(e)}"})}

        yield {"event": "done", "data": "[DONE]"}

    return EventSourceResponse(event_generator())
