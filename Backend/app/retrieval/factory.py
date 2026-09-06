import os
from app.retrieval.base import VectorStoreInterface
from app.retrieval.qdrant_store import QdrantVectorStore
from app.retrieval.pgvector_store import PgVectorStore

_vector_store_singleton = None

def get_vector_store() -> VectorStoreInterface:
    """
    Factory function returning the active VectorStoreInterface implementation
    based on the VECTOR_STORE_PROVIDER environment variable ("qdrant" or "pgvector").
    """
    global _vector_store_singleton
    if _vector_store_singleton is not None:
        return _vector_store_singleton

    provider = os.getenv("VECTOR_STORE_PROVIDER", "qdrant").strip().lower()

    if provider == "pgvector":
        print("[VectorStoreFactory]: Initializing PgVectorStore backend...")
        _vector_store_singleton = PgVectorStore()
    elif provider == "qdrant":
        print("[VectorStoreFactory]: Initializing QdrantVectorStore backend...")
        _vector_store_singleton = QdrantVectorStore()
    else:
        raise ValueError(f"Unsupported VECTOR_STORE_PROVIDER: '{provider}'. Supported options: 'qdrant', 'pgvector'.")

    return _vector_store_singleton
