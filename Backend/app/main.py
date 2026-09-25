import os
import re
import json
import time
import asyncio
import tempfile
import uuid
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv()

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


@app.get("/healthz")
def healthz():
    """Ultra-lightweight keep-alive endpoint for automated pings / health monitors."""
    return {"status": "alive", "service": "Nexus-RAG"}



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
    from app.llm_manager import fetch_active_groq_models, PREFERRED_MODEL_PRIORITY
    active_ids = fetch_active_groq_models(groq_api_key)
    
    default_models = [
        {"id": "qwen/qwen3.8-27b", "name": "Qwen 3.8 27B", "tag": "Fast & Smart"},
        {"id": "openai/gpt-oss-20b", "name": "GPT-OSS 20B", "tag": "Ultra Fast"},
        {"id": "openai/gpt-oss-120b", "name": "GPT-OSS 120B", "tag": "High Reasoning"},
    ]
    
    if active_ids:
        def model_priority(m_id):
            if m_id in PREFERRED_MODEL_PRIORITY:
                return PREFERRED_MODEL_PRIORITY.index(m_id)
            return 999
        active_ids.sort(key=model_priority)

        result = []
        for m_id in active_ids:
            name = m_id.split("/")[-1].replace("-", " ").title()
            tag = "Ultra Fast" if "20b" in m_id or "instant" in m_id or "8b" in m_id else "High Reasoning" if "120b" in m_id else "Fast & Smart"
            result.append({"id": m_id, "name": name, "tag": tag})
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
def list_conversations(request: Request, response: Response, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    user_email = request.headers.get("x-user-email", "")
    convs = crud.list_conversations(db, user_id, email=user_email)
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
def create_conversation(payload: ConversationCreate, request: Request, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    user_email = request.headers.get("x-user-email", "")
    conv = crud.create_conversation(db, user_id, title=payload.title or "New Conversation")
    if user_email:
        crud.sync_user_email(db, user_id, user_email)
    return ConversationListItem(
        id=conv.id,
        title=conv.title,
        source_file=conv.source_file,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=0,
    )


@app.get("/api/v1/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: str, request: Request, response: Response, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    user_email = request.headers.get("x-user-email", "")
    conv = crud.get_conversation(db, conversation_id, user_id, email=user_email)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = []
    for m in conv.messages:
        try:
            cits = json.loads(m.citations_json or "[]")
        except Exception:
            cits = []
        messages.append(
            MessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                citations=cits,
                created_at=m.created_at,
            )
        )
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
    conv = crud.get_or_create_conversation(db, conversation_id, user_id, title=filename.replace(".pdf", "").title())
    conv = crud.update_conversation_source_file(db, conv.id, filename, user_id)
    return {
        "status": "attached",
        "conversation_id": conv.id,
        "source_file": conv.source_file,
        "title": conv.title,
    }


@app.post("/api/v1/conversations/{conversation_id}/detach_document")
def detach_document_from_conversation(
    conversation_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
):
    """Detaches any attached document from the conversation session."""
    conv = crud.update_conversation_source_file(db, conversation_id, None, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "status": "detached",
        "conversation_id": conv.id,
        "source_file": None,
        "title": conv.title,
    }


@app.delete("/api/v1/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, response: Response, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    crud.delete_conversation(db, conversation_id, user_id)
    return {"status": "deleted", "id": conversation_id}


# ─── Documents ────────────────────────────────────────────────────────────────

@app.get("/api/v1/documents", response_model=List[IngestedDocumentResponse])
def list_documents(request: Request, response: Response, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    user_email = request.headers.get("x-user-email", "")
    return crud.list_ingested_docs(db, user_id, email=user_email)


@app.delete("/api/v1/documents/{filename:path}")
def delete_document(filename: str, request: Request, response: Response, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    user_email = request.headers.get("x-user-email", "")
    success = crud.delete_ingested_doc(db, filename, user_id, email=user_email)
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
        conv = crud.get_or_create_conversation(db, conversation_id, user_id, title=file.filename.replace(".pdf", "").title())
        crud.update_conversation_source_file(db, conv.id, file.filename, user_id)

    # Duplicate detection (sub-1ms)
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

    try:
        # Zero-disk pure in-memory extraction (<0.1s)
        raw_docs = ingestion_engine.load_pdf_from_bytes(content, file.filename)
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



# ─── Fast Path Classifier ───────────────────────────────────────────────────

def is_fast_path_query(question: str, source_file: Optional[str] = None) -> bool:
    """
    Determines if a query can bypass full RAG vector retrieval & Cohere re-ranking
    for sub-300ms response time (greetings, general chit-chat, or non-document prompts).
    """
    q = question.strip().lower()
    
    # 1. Standard greetings & small talk (matches hi, hiiiii, heyyy, hyyy, hello, etc.)
    greetings_patterns = [
        r"^(h+i+|h+e+y+|h+y+|h+e+l+o+|hola|namaste|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|sup|yo+)[\s!\.\?]*$",
        r"^(how\s+are\s+you.*|who\s+are\s+you.*|what\s+can\s+you\s+do.*|what\s+is\s+your\s+name.*|who\s+created\s+you.*)$",
        r"^(thanks.*|thank\s+you.*|bye.*|goodbye.*|cool|awesome|great|ok|okay)[\s!\.]*$",
        r"^(help|what\s+is\s+nexus\s*rag|tell\s+me\s+about\s+yourself)$"
    ]
    
    for pat in greetings_patterns:
        if re.search(pat, q):
            return True

    # 2. If no source file attached to this chat session, answer as general enterprise assistant
    if not source_file:
        return True

    return False


# ─── Query Stream ─────────────────────────────────────────────────────────────

@app.post("/api/v1/query/stream")
@limiter.limit("30/minute")
async def stream_query(request: Request, payload: QueryRequest, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """SSE streaming endpoint. Checks Redis cache, executes fast-path or RAG graph, saves to DB."""

    async def event_generator():
        try:
            source_file = None
            if payload.conversation_id:
                conv = crud.get_or_create_conversation(db, payload.conversation_id, user_id, title=payload.question[:80])
                source_file = conv.source_file
                crud.add_message(db, conv.id, user_id, "user", payload.question)

            # 1. Check Instant Conversational Intent Engine (Sub-5ms for greetings, "what you do", well-being, help)
            from app.intent_engine import get_instant_conversational_response
            instant_answer = get_instant_conversational_response(payload.question)
            if instant_answer:
                yield {"event": "citations", "data": json.dumps({"citations": []})}
                yield {"event": "telemetry", "data": json.dumps({"ttft_ms": 4, "cache_hit": True, "score": 1.0, "provider": "Instant Intent Engine"})}
                for word in instant_answer.split(" "):
                    yield {"event": "message", "data": json.dumps({"token": word + " "})}
                    await asyncio.sleep(0.005)
                if payload.conversation_id:
                    crud.add_message(db, payload.conversation_id, user_id, "assistant", instant_answer, [])
                yield {"event": "done", "data": "[DONE]"}
                return

            # 2. Check Redis Semantic Cache (Strictly scoped by user and document)
            cached_result = semantic_cache.get_cached_response(
                payload.question,
                user_id=user_id,
                doc_id=source_file or "general"
            )
            if cached_result:
                cached_generation, cached_citations, score = cached_result
                yield {"event": "citations", "data": json.dumps({"citations": cached_citations})}
                yield {"event": "telemetry", "data": json.dumps({"ttft_ms": 1, "cache_hit": True, "score": round(score, 3)})}
                for word in cached_generation.split(" "):
                    yield {"event": "message", "data": json.dumps({"token": word + " "})}
                    await asyncio.sleep(0.004)
                if payload.conversation_id:
                    crud.add_message(db, payload.conversation_id, user_id, "assistant", cached_generation, cached_citations)
                yield {"event": "done", "data": "[DONE]"}
                return

            # 3. Check Fast-Path (Sub-200ms direct true streaming for chit-chat / general queries)
            if is_fast_path_query(payload.question, source_file):
                groq_api_key = os.getenv("GROQ_API_KEY", "")
                active_model = payload.model or get_active_llm_model_name()
                
                from langchain_groq import ChatGroq
                from langchain_core.prompts import ChatPromptTemplate
                from app.llm_manager import fetch_active_groq_models
                
                prompt = ChatPromptTemplate.from_messages([
                    ("system", "You are Nexus-RAG, an intelligent Enterprise AI Assistant. Provide helpful, accurate, concise, and beautifully formatted responses using Markdown."),
                    ("human", "{question}")
                ])
                
                yield {"event": "citations", "data": json.dumps({"citations": []})}
                
                generation_chunks = []
                start_time = time.time()
                first_token_time = None
                
                try:
                    llm = ChatGroq(
                        temperature=0.7,
                        model_name=active_model,
                        groq_api_key=groq_api_key,
                        max_tokens=1024,
                        streaming=True,
                    )
                    chain = prompt | llm
                    async for chunk in chain.astream({"question": payload.question}):
                        token = chunk.content if hasattr(chunk, "content") else str(chunk)
                        if token:
                            if first_token_time is None:
                                first_token_time = time.time()
                                ttft_ms = int((first_token_time - start_time) * 1000)
                                yield {"event": "telemetry", "data": json.dumps({"ttft_ms": ttft_ms, "model": active_model, "cache_hit": False})}
                            generation_chunks.append(token)
                            yield {"event": "message", "data": json.dumps({"token": token})}
                except Exception as fast_path_err:
                    print(f"[Fast Path LLM Warning]: Model '{active_model}' failed ({fast_path_err}). Attempting fallback...")
                    try:
                        available = fetch_active_groq_models(groq_api_key)
                        fallback_model = next((m for m in available if m != active_model), "qwen/qwen3.8-27b")
                        fallback_llm = ChatGroq(
                            temperature=0.7,
                            model_name=fallback_model,
                            groq_api_key=groq_api_key,
                            max_tokens=1024,
                            streaming=True,
                        )
                        fallback_chain = prompt | fallback_llm
                        async for chunk in fallback_chain.astream({"question": payload.question}):
                            token = chunk.content if hasattr(chunk, "content") else str(chunk)
                            if token:
                                if first_token_time is None:
                                    first_token_time = time.time()
                                    ttft_ms = int((first_token_time - start_time) * 1000)
                                    yield {"event": "telemetry", "data": json.dumps({"ttft_ms": ttft_ms, "model": fallback_model, "cache_hit": False})}
                                generation_chunks.append(token)
                                yield {"event": "message", "data": json.dumps({"token": token})}
                    except Exception as fb_err:
                        err_token = f"Error generating response: {str(fast_path_err)}"
                        generation_chunks.append(err_token)
                        yield {"event": "message", "data": json.dumps({"token": err_token})}

                full_generation = "".join(generation_chunks)
                if full_generation and not full_generation.startswith("Error"):
                    semantic_cache.set_cached_response(
                        payload.question,
                        full_generation,
                        [],
                        user_id=user_id,
                        doc_id=source_file or "general"
                    )
                if payload.conversation_id:
                    crud.add_message(db, payload.conversation_id, user_id, "assistant", full_generation, [])
                
                yield {"event": "done", "data": "[DONE]"}
                return

            # 4. Fast RAG Workflow with True Real-Time Token Streaming
            rag_start_time = time.time()
            from app.graph.nodes import retrieve_node, rerank_node, web_search_node

            initial_state = {
                "question": payload.question,
                "model": payload.model,
                "source_file": source_file,
                "user_id": user_id,
                "documents": [],
                "child_documents": [],
                "reranked_documents": [],
                "web_context": "",
                "generation": "",
                "citation_sources": [],
                "error": None,
            }

            # Step 1: Retrieval Agent
            yield {"event": "agent", "data": json.dumps({"agent_step": "Retrieval Agent is searching document vectors..."})}
            retrieve_update = retrieve_node(initial_state)
            initial_state.update(retrieve_update)

            # Step 2: Re-ranking Agent
            yield {"event": "agent", "data": json.dumps({"agent_step": "Re-Ranking Agent is prioritizing most relevant context..."})}
            rerank_update = rerank_node(initial_state)
            initial_state.update(rerank_update)

            citations = initial_state.get("citation_sources", [])
            yield {"event": "citations", "data": json.dumps({"citations": citations})}

            # Step 3: Web Search Fallback (if document context missing)
            reranked_docs = initial_state.get("reranked_documents", [])
            if not reranked_docs:
                web_update = web_search_node(initial_state)
                initial_state.update(web_update)
                if initial_state.get("web_context"):
                    yield {"event": "agent", "data": json.dumps({"agent_step": "Web Search Agent found live context from DuckDuckGo..."})}

            web_context = initial_state.get("web_context", "")

            # Step 4: True Real-time Streaming Synthesis with Groq
            if not reranked_docs and not web_context:
                empty_msg = "No relevant context was found in the ingested documents to answer your query."
                yield {"event": "telemetry", "data": json.dumps({"ttft_ms": 150, "model": payload.model or get_active_llm_model_name(), "cache_hit": False, "sources": 0})}
                yield {"event": "message", "data": json.dumps({"token": empty_msg})}
                if payload.conversation_id:
                    crud.add_message(db, payload.conversation_id, user_id, "assistant", empty_msg, [])
                yield {"event": "done", "data": "[DONE]"}
                return

            context_str = "\n\n---\n\n".join(
                [f"[Source: {doc.metadata.get('source_file')}, Page: {doc.metadata.get('page', 1)}]\n{doc.page_content}" 
                 for doc in reranked_docs]
            )
            if web_context:
                context_str += f"\n\n--- WEB CONTEXT ---\n{web_context}"

            if len(context_str) > 6000:
                context_str = context_str[:6000] + "\n\n[Context truncated for token limit...]"

            yield {"event": "agent", "data": json.dumps({"agent_step": "Synthesis Agent drafted final response..."})}

            from langchain_core.prompts import ChatPromptTemplate
            from langchain_groq import ChatGroq
            from app.llm_manager import fetch_active_groq_models

            prompt = ChatPromptTemplate.from_messages([
                ("system", "You are Nexus-RAG, an Enterprise-grade Document Intelligence Assistant.\n"
                           "Answer the user's query factually, concisely, and directly based on the provided Context.\n"
                           "Structure your answer cleanly using rich Markdown: bullet points, bold key terms or metrics, and short informative paragraphs.\n"
                           "If the context does not contain enough information, state that clearly and succinctly without hallucinating.\n\n"
                           "Context:\n{context}"),
                ("human", "{question}")
            ])

            groq_api_key = os.getenv("GROQ_API_KEY", "")
            active_model = payload.model or get_active_llm_model_name()
            generation_chunks = []
            first_token_time = None

            try:
                llm = ChatGroq(
                    temperature=0.1,
                    model_name=active_model,
                    groq_api_key=groq_api_key,
                    max_tokens=1024,
                    streaming=True,
                )
                chain = prompt | llm
                async for chunk in chain.astream({"context": context_str, "question": payload.question}):
                    token = chunk.content if hasattr(chunk, "content") else str(chunk)
                    if token:
                        if first_token_time is None:
                            first_token_time = time.time()
                            ttft_ms = int((first_token_time - rag_start_time) * 1000)
                            yield {"event": "telemetry", "data": json.dumps({"ttft_ms": ttft_ms, "model": active_model, "cache_hit": False, "sources": len(citations)})}
                        generation_chunks.append(token)
                        yield {"event": "message", "data": json.dumps({"token": token})}
            except Exception as primary_err:
                print(f"[RAG Stream Warning]: Model '{active_model}' failed ({primary_err}). Trying fallback...")
                try:
                    available = fetch_active_groq_models(groq_api_key)
                    fallback_model = next((m for m in available if m != active_model), "qwen/qwen3.8-27b")
                    fallback_llm = ChatGroq(
                        temperature=0.1,
                        model_name=fallback_model,
                        groq_api_key=groq_api_key,
                        max_tokens=1024,
                        streaming=True,
                    )
                    fallback_chain = prompt | fallback_llm
                    async for chunk in fallback_chain.astream({"context": context_str, "question": payload.question}):
                        token = chunk.content if hasattr(chunk, "content") else str(chunk)
                        if token:
                            if first_token_time is None:
                                first_token_time = time.time()
                                ttft_ms = int((first_token_time - rag_start_time) * 1000)
                                yield {"event": "telemetry", "data": json.dumps({"ttft_ms": ttft_ms, "model": fallback_model, "cache_hit": False, "sources": len(citations)})}
                            generation_chunks.append(token)
                            yield {"event": "message", "data": json.dumps({"token": token})}
                except Exception as fb_err:
                    err_msg = f"Error generating response: {str(primary_err)}"
                    generation_chunks.append(err_msg)
                    yield {"event": "message", "data": json.dumps({"token": err_msg})}

            full_generation = "".join(generation_chunks)
            if full_generation and not full_generation.startswith("Error"):
                semantic_cache.set_cached_response(
                    payload.question,
                    full_generation,
                    citations,
                    user_id=user_id,
                    doc_id=source_file or "general"
                )
            if payload.conversation_id and full_generation:
                crud.add_message(db, payload.conversation_id, user_id, "assistant", full_generation, citations)


        except Exception as e:
            err_msg = f"[System Error]: {str(e)}"
            yield {"event": "message", "data": json.dumps({"token": f"\n\n{err_msg}"})}
            if payload.conversation_id:
                try:
                    crud.add_message(db, payload.conversation_id, user_id, "assistant", err_msg, [])
                except Exception:
                    pass

        yield {"event": "done", "data": "[DONE]"}

    return EventSourceResponse(event_generator())

