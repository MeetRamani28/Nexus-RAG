import os
import pickle
from typing import List, Dict, Any
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_qdrant import QdrantVectorStore
from langchain_core.documents import Document
from qdrant_client import QdrantClient
from qdrant_client.http import models

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "qdrant_storage")
PARENT_STORE_PATH = os.path.join(STORAGE_DIR, "parent_store.pkl")
os.makedirs(STORAGE_DIR, exist_ok=True)

class HybridVectorStore:
    """
    Manages Dense Vector Storage (Qdrant Disk Persistence) and Parent-Child retrieval.
    """

    def __init__(self, collection_name: str = "nexus_rag_docs"):
        self.collection_name = collection_name

        self.embeddings = HuggingFaceEmbeddings(
            model_name="all-MiniLM-L6-v2",
            model_kwargs={'device': 'cpu'}
        )

        self.parent_store: Dict[str, Document] = self._load_parent_store()

        self.client = QdrantClient(path=os.path.join(STORAGE_DIR, "qdrant_db"))
        self.vector_db = None
        self._ensure_collection_exists()

    def _load_parent_store(self) -> Dict[str, Document]:
        """Loads parent documents dictionary from pickle file."""
        if os.path.exists(PARENT_STORE_PATH):
            try:
                with open(PARENT_STORE_PATH, "rb") as f:
                    return pickle.load(f)
            except Exception as e:
                print(f"[Store Load Warning]: {e}")
        return {}

    def _save_parent_store(self):
        """Saves parent documents dictionary to pickle file."""
        try:
            with open(PARENT_STORE_PATH, "wb") as f:
                pickle.dump(self.parent_store, f)
        except Exception as e:
            print(f"[Store Save Error]: {e}")

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
        Stores Parent docs in lookup disk-file and embeds Child docs in Qdrant Disk Storage.
        """
        for p_doc in parent_docs:
            parent_id = p_doc.metadata.get("parent_id")
            if parent_id:
                self.parent_store[parent_id] = p_doc
        self._save_parent_store()

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
        """
        if self.vector_db is None:
            self.vector_db = QdrantVectorStore(
                client=self.client,
                collection_name=self.collection_name,
                embedding=self.embeddings,
            )

        matched_children = []
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

        if not retrieved_parents and self.parent_store:
            return list(self.parent_store.values())[:5]

        return retrieved_parents