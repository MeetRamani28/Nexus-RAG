import os
import sys
from dotenv import load_dotenv

# Load environment variables from Backend/.env
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))

# Ensure Backend directory is in Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.ingestion.pdf_processor import PDFIngestionEngine
from app.retrieval.qdrant_store import QdrantVectorStore
from app.db.database import init_db, SessionLocal
from app.db import crud

def ingest_all():
    print("[Ingest Eval Docs]: Initializing DB...")
    init_db()
    
    eval_user_id = "eval_user"
    db = SessionLocal()
    try:
        crud.create_or_update_user(db, user_id=eval_user_id, email="eval_user@nexus.ai")
        print(f"  -> User '{eval_user_id}' created/ensured in database.")
    finally:
        db.close()
        
    engine = PDFIngestionEngine(parent_chunk_size=2000, child_chunk_size=400, chunk_overlap=100)
    qdrant = QdrantVectorStore()
    
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    sample_files = ["sample_financial_report.pdf", "tech_company_annual_report_2025.pdf"]
    
    for filename in sample_files:
        filepath = os.path.join(repo_root, filename)
        if not os.path.exists(filepath):
            print(f"[Error]: File not found: {filepath}")
            continue
            
        print(f"[Ingesting]: {filename}...")
        raw_pages = engine.load_pdf(filepath)
        parent_docs, child_docs = engine.create_parent_child_chunks(raw_pages, filename)
        
        print(f"  -> Generated {len(parent_docs)} parent chunks, {len(child_docs)} child chunks.")
        qdrant.store_documents(parent_docs, child_docs, user_id=eval_user_id)
        print(f"  -> Successfully stored {filename} in vector store & database.")

if __name__ == "__main__":
    ingest_all()
