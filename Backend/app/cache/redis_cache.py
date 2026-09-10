import os
import json
import uuid
import numpy as np
from typing import Optional, Tuple, List, Dict, Any
from app.core.embeddings import get_embeddings

try:
    import redis
except ImportError:
    redis = None


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculates cosine similarity between two 1D float vectors."""
    a = np.array(vec1, dtype=np.float32)
    b = np.array(vec2, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


class RedisSemanticCache:
    """
    Semantic Cache layer backed by Redis with InMemory fallback.
    Caches query embeddings & LLM responses to bypass external API calls
    when incoming queries have cosine similarity > threshold (default 0.95).
    """

    def __init__(self, redis_url: str = None, similarity_threshold: float = None):
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379/0")
        if similarity_threshold is not None:
            self.similarity_threshold = similarity_threshold
        else:
            self.similarity_threshold = float(os.getenv("REDIS_CACHE_SIMILARITY_THRESHOLD", "0.95"))
        self.embeddings = get_embeddings()
        self.client = None
        self._in_memory_cache = {}  # Fallback
        self._connect()

    def _connect(self):
        """Establishes connection to Redis server."""
        if redis is None:
            print("[Redis Cache Warning]: 'redis' package is not installed. Using InMemory fallback.")
            return

        try:
            self.client = redis.Redis.from_url(self.redis_url, decode_responses=True, socket_timeout=2.0)
            self.client.ping()
            print(f"[Redis Cache]: Connected to Redis server at {self.redis_url}")
        except Exception as e:
            print(f"[Redis Cache Warning]: Could not connect to Redis ({e}). Using InMemory fallback.")
            self.client = None

    def get_cached_response(self, query: str) -> Optional[Tuple[str, List[Dict[str, Any]], float]]:
        """
        Checks Redis (or InMemory) for semantic cache hit.
        Returns Tuple of (cached_answer, citation_sources, similarity_score) if hit (> threshold), else None.
        """
        try:
            query_vector = self.embeddings.embed_query(query)
            best_match_key = None
            highest_similarity = -1.0
            best_cached_data = None

            if self.client:
                cache_keys = self.client.keys("nexus_rag:cache:*")
                for key in cache_keys:
                    raw_data = self.client.get(key)
                    if raw_data:
                        cached_item = json.loads(raw_data)
                        cached_vector = cached_item.get("embedding", [])
                        if cached_vector:
                            sim = cosine_similarity(query_vector, cached_vector)
                            if sim > highest_similarity:
                                highest_similarity = sim
                                best_match_key = key
                                best_cached_data = cached_item
            else:
                for key, cached_item in self._in_memory_cache.items():
                    cached_vector = cached_item.get("embedding", [])
                    if cached_vector:
                        sim = cosine_similarity(query_vector, cached_vector)
                        if sim > highest_similarity:
                            highest_similarity = sim
                            best_match_key = key
                            best_cached_data = cached_item

            if highest_similarity >= self.similarity_threshold and best_cached_data:
                print(f"[Semantic Cache HIT]: Similarity {highest_similarity:.4f} >= {self.similarity_threshold} for query: '{query}'")
                return (
                    best_cached_data.get("generation", ""),
                    best_cached_data.get("citation_sources", []),
                    highest_similarity
                )

            print(f"[Semantic Cache MISS]: Max similarity {highest_similarity:.4f} < {self.similarity_threshold}")
            return None

        except Exception as e:
            print(f"[Semantic Cache Read Error]: {e}")
            return None

    def set_cached_response(
        self, query: str, generation: str, citation_sources: List[Dict[str, Any]], ttl_seconds: int = 86400
    ) -> None:
        """
        Caches a query, its embedding vector, answer generation, and citations.
        """
        try:
            query_vector = self.embeddings.embed_query(query)
            cache_id = f"nexus_rag:cache:{uuid.uuid4().hex[:12]}"
            payload = {
                "query": query,
                "embedding": query_vector,
                "generation": generation,
                "citation_sources": citation_sources
            }
            if self.client:
                self.client.set(cache_id, json.dumps(payload), ex=ttl_seconds)
            else:
                self._in_memory_cache[cache_id] = payload
            print(f"[Semantic Cache SET]: Cached response for query: '{query}'")
        except Exception as e:
            print(f"[Semantic Cache Write Error]: {e}")
