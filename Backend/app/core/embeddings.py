"""
Shared Embedding Model Singleton.

`all-MiniLM-L6-v2` loads once at startup and is reused across:
  - QdrantVectorStore  (retrieval)
  - RedisSemanticCache (cache similarity)

This prevents the model from being loaded multiple times and reduces startup time.
"""
import os
from langchain_huggingface import HuggingFaceEmbeddings

_embeddings_instance = None

EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")


def get_embeddings() -> HuggingFaceEmbeddings:
    """
    Returns the shared singleton HuggingFaceEmbeddings instance.
    Loads the model only once on first call; subsequent calls return cached instance.
    """
    global _embeddings_instance
    if _embeddings_instance is None:
        print(f"[Embeddings]: Loading '{EMBEDDING_MODEL_NAME}' model (once)...")
        _embeddings_instance = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL_NAME,
            model_kwargs={"device": "cpu"},
        )
        print(f"[Embeddings]: Model '{EMBEDDING_MODEL_NAME}' loaded and cached.")
    return _embeddings_instance
