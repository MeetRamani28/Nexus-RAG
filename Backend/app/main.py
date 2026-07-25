import os
import json
import asyncio
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from dotenv import load_dotenv

from app.schemas.payload import QueryRequest, DocumentIngestResponse
from app.ingestion.pdf_processor import PDFIngestionEngine
from app.graph.nodes import vector_store_instance
from app.graph.workflow import rag_graph

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

@app.get("/")
def read_root():
    return {"status": "online", "system": "Nexus-RAG Enterprise Engine v1.0"}


@app.post("/api/v1/ingest", response_model=DocumentIngestResponse)
async def ingest_pdf(file: UploadFile = File(...)):
    """
    Endpoint to upload and process PDF documents with Parent-Child chunking.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    temp_path = f"/tmp/{file.filename}"
    os.makedirs("/tmp", exist_ok=True)

    try:
        with open(temp_path, "wb") as f:
            f.write(await file.read())

        raw_docs = ingestion_engine.load_pdf(temp_path)
        parent_docs, child_docs = ingestion_engine.create_parent_child_chunks(raw_docs, file.filename)

        vector_store_instance.store_documents(parent_docs, child_docs)

        return DocumentIngestResponse(
            status="success",
            filename=file.filename,
            parent_chunks_created=len(parent_docs),
            child_chunks_created=len(child_docs),
            message="Document successfully processed, indexed, and stored in Qdrant."
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/api/v1/query/stream")
async def stream_query(payload: QueryRequest):
    """
    SSE Streaming Endpoint: Executes LangGraph workflow and streams final response tokens.
    """
    async def event_generator():
        initial_state = {
            "question": payload.question,
            "documents": [],
            "child_documents": [],
            "reranked_documents": [],
            "generation": "",
            "citation_sources": [],
            "error": None
        }

        final_state = rag_graph.invoke(initial_state)

        citations_event = {
            "event": "citations",
            "data": json.dumps({"citations": final_state.get("citation_sources", [])})
        }
        yield citations_event

        generation_text = final_state.get("generation", "")
        for word in generation_text.split(" "):
            chunk_event = {
                "event": "message",
                "data": json.dumps({"token": word + " "})
            }
            yield chunk_event
            await asyncio.sleep(0.03)

        yield {"event": "done", "data": "[DONE]"}

    return EventSourceResponse(event_generator())