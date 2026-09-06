import os
import json
import asyncio
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from dotenv import load_dotenv

from app.schemas.payload import QueryRequest, DocumentIngestResponse
from app.ingestion.pdf_processor import PDFIngestionEngine
from app.graph.nodes import vector_store_instance
from app.graph.workflow import rag_graph
from app.cache import RedisSemanticCache
from app.llm_manager import get_active_llm_model_name

load_dotenv()

app = FastAPI(title="Nexus-RAG Backend Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ingestion_engine = PDFIngestionEngine()
semantic_cache = RedisSemanticCache()

@app.get("/")
def read_root():
    return {"status": "online", "system": "Nexus-RAG Enterprise Engine v1.0"}


@app.get("/api/v1/system/info")
def get_system_info():
    provider = os.getenv("VECTOR_STORE_PROVIDER", "qdrant").strip().lower()
    active_model = get_active_llm_model_name()
    hyde_enabled = os.getenv("HYDE_ENABLED", "true").strip().lower() in ["true", "1", "yes"]
    return {
        "status": "online",
        "system": "Nexus-RAG Enterprise Engine v1.0",
        "active_llm_model": active_model,
        "vector_provider": provider,
        "reranker_model": "rerank-english-v3.0",
        "hyde_enabled": hyde_enabled
    }


@app.post("/api/v1/ingest", response_model=DocumentIngestResponse)
async def ingest_pdf(file: UploadFile = File(...)):
    """
    Endpoint to upload and process PDF documents with Parent-Child chunking.
    Uses tempfile module for Windows and Linux compatibility.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        temp_path = tmp_file.name

    try:
        raw_docs = ingestion_engine.load_pdf(temp_path)
        parent_docs, child_docs = ingestion_engine.create_parent_child_chunks(raw_docs, file.filename)

        vector_store_instance.store_documents(parent_docs, child_docs)

        return DocumentIngestResponse(
            status="success",
            filename=file.filename,
            parent_chunks_created=len(parent_docs),
            child_chunks_created=len(child_docs),
            message="Document successfully processed, indexed, and stored in Vector Store."
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/api/v1/query/stream")
async def stream_query(payload: QueryRequest):
    """
    SSE Streaming Endpoint: Checks Redis Semantic Cache first, then executes LangGraph workflow.
    """
    async def event_generator():
        try:
            # 1. Check Redis Semantic Cache
            cached_result = semantic_cache.get_cached_response(payload.question)
            if cached_result:
                cached_generation, cached_citations, score = cached_result
                
                # Stream cached citations
                yield {
                    "event": "citations",
                    "data": json.dumps({"citations": cached_citations})
                }

                # Stream cached generation tokens
                for word in cached_generation.split(" "):
                    yield {
                        "event": "message",
                        "data": json.dumps({"token": word + " "})
                    }
                    await asyncio.sleep(0.01)

                yield {"event": "done", "data": "[DONE]"}
                return

            # 2. Cache Miss: Execute LangGraph RAG Workflow
            initial_state: dict = {
                "question": payload.question,
                "documents": [],
                "child_documents": [],
                "reranked_documents": [],
                "generation": "",
                "citation_sources": [],
                "error": None
            }

            final_state = rag_graph.invoke(initial_state)

            citations = final_state.get("citation_sources", [])
            generation_text = final_state.get("generation", "No response generated.")

            citations_event = {
                "event": "citations",
                "data": json.dumps({"citations": citations})
            }
            yield citations_event

            for word in generation_text.split(" "):
                chunk_event = {
                    "event": "message",
                    "data": json.dumps({"token": word + " "})
                }
                yield chunk_event
                await asyncio.sleep(0.02)

            # 3. Store result in Redis Semantic Cache for future queries
            if generation_text and not generation_text.startswith("Error"):
                semantic_cache.set_cached_response(payload.question, generation_text, citations)

        except Exception as e:
            error_event = {
                "event": "message",
                "data": json.dumps({"token": f"\n\n[System Error]: {str(e)}"})
            }
            yield error_event

        yield {"event": "done", "data": "[DONE]"}

    return EventSourceResponse(event_generator())