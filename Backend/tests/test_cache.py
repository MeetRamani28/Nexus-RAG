import os
import sys
import pytest
from dotenv import load_dotenv

load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.cache.redis_cache import RedisSemanticCache, cosine_similarity

def test_cosine_similarity():
    v1 = [1.0, 0.0, 0.0]
    v2 = [1.0, 0.0, 0.0]
    v3 = [0.0, 1.0, 0.0]
    
    assert abs(cosine_similarity(v1, v2) - 1.0) < 1e-5
    assert abs(cosine_similarity(v1, v3) - 0.0) < 1e-5

def test_semantic_cache_set_get():
    cache = RedisSemanticCache()
    query = "What is the ARR of Aether Cloud in 2025?"
    generation = "Aether Cloud ARR reached $52.8M in FY2025."
    user_id = "test_cache_user"
    doc_id = "aether_2025.pdf"

    cache.set_cached_response(
        query=query,
        generation=generation,
        citation_sources=[],
        user_id=user_id,
        doc_id=doc_id
    )

    result = cache.get_cached_response(query=query, user_id=user_id, doc_id=doc_id)
    assert result is not None
    assert result[0] == generation
    assert result[2] >= 0.95
