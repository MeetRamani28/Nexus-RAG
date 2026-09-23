import os
import sys
import pytest
from langchain_core.documents import Document

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.ingestion.pdf_processor import PDFIngestionEngine, validate_file_size, compute_file_hash

def test_file_size_validation():
    small_file = b"a" * (10 * 1024 * 1024)  # 10MB
    large_file = b"a" * (26 * 1024 * 1024)  # 26MB
    
    assert validate_file_size(small_file) is True
    assert validate_file_size(large_file) is False

def test_file_hash():
    content = b"Nexus-RAG Financial Report PDF Data"
    hash1 = compute_file_hash(content)
    hash2 = compute_file_hash(content)
    assert hash1 == hash2
    assert len(hash1) == 32

def test_parent_child_chunking():
    engine = PDFIngestionEngine(parent_chunk_size=500, child_chunk_size=100, chunk_overlap=20)
    raw_text = "Nexus Tech Corp generated $42.5M in Q3 2026. " * 30
    doc = Document(page_content=raw_text, metadata={"page": 0})
    
    parents, children = engine.create_parent_child_chunks([doc], "test_report.pdf")
    
    assert len(parents) > 0
    assert len(children) > len(parents)
    assert children[0].metadata.get("parent_id") == parents[0].metadata.get("parent_id")
    assert children[0].metadata.get("source_file") == "test_report.pdf"
