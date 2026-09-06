"""
Shared Embedding Model Singleton.

`embed-english-v3.0` loads once at startup and is reused across:
  - QdrantVectorStore  (retrieval)
  - RedisSemanticCache (cache similarity)

Uses Cohere API to completely avoid local PyTorch memory constraints (Render 512MB RAM Fix).
"""
import os
from langchain_cohere import CohereEmbeddings

_embeddings_instance = None

EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "embed-english-v3.0")


def get_embeddings() -> CohereEmbeddings:
    """
    Returns the shared singleton CohereEmbeddings instance.
    Loads the model only once on first call; subsequent calls return cached instance.
    """
    global _embeddings_instance
    if _embeddings_instance is None:
        print(f"[Embeddings]: Loading '{EMBEDDING_MODEL_NAME}' model (once) via Cohere API...")
        _embeddings_instance = CohereEmbeddings(
            model=EMBEDDING_MODEL_NAME,
            cohere_api_key=os.getenv("COHERE_API_KEY", "")
        )
        print(f"[Embeddings]: Model '{EMBEDDING_MODEL_NAME}' loaded and cached.")
    return _embeddings_instance
