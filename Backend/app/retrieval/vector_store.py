import os
from typing import List, Dict, Any
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_qdrant import QdrantVectorStore
from langchain_core.documents import Document
from qdrant_client import QdrantClient
from qdrant_client.http import models

class HybridVectorStore:
    """
    Manages Dense Vector Storage (Qdrant In-Memory) and Parent-Child retrieval.
    Includes strong fallback mechanism for financial text tables.
    """

    def __init__(self, collection_name: str = "nexus_rag_docs"):
        self.collection_name = collection_name

        self.embeddings = HuggingFaceEmbeddings(
            model_name="all-MiniLM-L6-v2",
            model_kwargs={'device': 'cpu'}
        )

        self.parent_store: Dict[str, Document] = {}
        self.client = QdrantClient(":memory:")
        self.vector_db = None

    def _ensure_collection_exists(self):
        collections = self.client.get_collections().collections
        exists = any(c.name == self.collection_name for c in collections)
        
        if not exists:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=384,
                    distance=models.Distance.COSINE
                )
            )

    def store_documents(self, parent_docs: List[Document], child_docs: List[Document]):
        """
        Stores Parent docs in lookup memory and embeds Child docs in Qdrant In-Memory.
        """
        self.parent_store.clear()
        for p_doc in parent_docs:
            parent_id = p_doc.metadata.get("parent_id")
            if parent_id:
                self.parent_store[parent_id] = p_doc

        self._ensure_collection_exists()

        self.vector_db = QdrantVectorStore(
            client=self.client,
            collection_name=self.collection_name,
            embedding=self.embeddings,
        )
        self.vector_db.add_documents(documents=child_docs)

    def search_child_and_fetch_parents(self, query: str, top_k: int = 10) -> List[Document]:
        """
        Performs similarity search on Child chunks, then fetches corresponding Parent chunks.
        Fallback to returning stored parents if similarity returns empty.
        """
        if not self.parent_store:
            return []

        matched_children = []
        if self.vector_db is not None:
            try:
                matched_children = self.vector_db.similarity_search(query, k=top_k)
            except Exception as e:
                print(f"[Vector Search Warning]: {e}")

        retrieved_parents: List[Document] = []
        seen_parent_ids = set()

        for child in matched_children:
            parent_id = child.metadata.get("parent_id")
            if parent_id and parent_id not in seen_parent_ids:
                seen_parent_ids.add(parent_id)
                parent_doc = self.parent_store.get(parent_id)
                if parent_doc:
                    retrieved_parents.append(parent_doc)

        # CRITICAL FALLBACK: If vector search missed context, return top stored Parent docs
        if not retrieved_parents and self.parent_store:
            print("[Retriever Fallback]: Vector search yielded no parents, fetching indexed parents directly.")
            return list(self.parent_store.values())[:5]

        return retrieved_parents