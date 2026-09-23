import os
import sys
import pytest
from dotenv import load_dotenv
from langchain_core.documents import Document

load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.retrieval.qdrant_store import QdrantVectorStore
from app.cache.redis_cache import RedisSemanticCache
from app.db.database import init_db, SessionLocal
from app.db import crud

@pytest.fixture(scope="module")
def setup_db_and_store():
    init_db()
    db = SessionLocal()
    try:
        crud.create_or_update_user(db, "user_alpha", "alpha@test.com")
        crud.create_or_update_user(db, "user_beta", "beta@test.com")
    finally:
        db.close()
    
    store = QdrantVectorStore(collection_name="test_isolation_collection")
    yield store

def test_qdrant_multi_tenant_isolation(setup_db_and_store):
    store = setup_db_and_store
    
    # User A Document
    parent_a = Document(page_content="Alpha Confidential Report - Net Revenue $99M", metadata={"parent_id": "p_alpha_01", "source_file": "doc_alpha.pdf"})
    child_a = Document(page_content="Alpha Revenue $99M", metadata={"child_id": "c_alpha_01", "parent_id": "p_alpha_01", "source_file": "doc_alpha.pdf"})
    
    # User B Document
    parent_b = Document(page_content="Beta Confidential Report - Net Revenue $12M", metadata={"parent_id": "p_beta_01", "source_file": "doc_beta.pdf"})
    child_b = Document(page_content="Beta Revenue $12M", metadata={"child_id": "c_beta_01", "parent_id": "p_beta_01", "source_file": "doc_beta.pdf"})
    
    store.store_documents([parent_a], [child_a], user_id="user_alpha")
    store.store_documents([parent_b], [child_b], user_id="user_beta")
    
    # Search as User A
    results_a = store.search_child_and_fetch_parents("Net Revenue", top_k=5, user_id="user_alpha")
    assert len(results_a) > 0
    for doc in results_a:
        assert doc.metadata.get("source_file") == "doc_alpha.pdf"
        assert "Alpha" in doc.page_content
        assert "Beta" not in doc.page_content
        
    # Search as User B
    results_b = store.search_child_and_fetch_parents("Net Revenue", top_k=5, user_id="user_beta")
    assert len(results_b) > 0
    for doc in results_b:
        assert doc.metadata.get("source_file") == "doc_beta.pdf"
        assert "Beta" in doc.page_content
        assert "Alpha" not in doc.page_content

def test_redis_semantic_cache_isolation():
    cache = RedisSemanticCache()
    query = "What was the Net Revenue?"
    
    # Set cache for User A
    cache.set_cached_response(
        query=query,
        generation="User Alpha Revenue is $99M",
        citation_sources=[],
        user_id="user_alpha",
        doc_id="doc_alpha.pdf"
    )
    
    # User A cache hit
    hit_a = cache.get_cached_response(query=query, user_id="user_alpha", doc_id="doc_alpha.pdf")
    assert hit_a is not None
    assert "User Alpha" in hit_a[0]
    
    # User B cache check must MISS
    hit_b = cache.get_cached_response(query=query, user_id="user_beta", doc_id="doc_beta.pdf")
    assert hit_b is None, "User B should NOT hit cache created by User A!"
