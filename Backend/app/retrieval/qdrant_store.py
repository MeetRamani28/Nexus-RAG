import os
import pickle
from typing import List, Dict
from langchain_qdrant import QdrantVectorStore as LangChainQdrant
from langchain_core.documents import Document
from qdrant_client import QdrantClient
from qdrant_client.http import models

from app.retrieval.base import VectorStoreInterface
from app.core.embeddings import get_embeddings

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "qdrant_storage")
PARENT_STORE_PATH = os.path.join(STORAGE_DIR, "parent_store.pkl")
os.makedirs(STORAGE_DIR, exist_ok=True)

class QdrantVectorStore(VectorStoreInterface):
    """
    Qdrant implementation of VectorStoreInterface.
    Manages Dense Vector Storage (Qdrant Disk Persistence) and Parent-Child retrieval.
    """

    def __init__(self, collection_name: str = "nexus_rag_docs"):
        self.collection_name = collection_name

        # Use shared singleton — loads only once across the entire app
        self.embeddings = get_embeddings()

        self.parent_store: Dict[str, Document] = self._load_parent_store()
        
        qdrant_url = os.getenv("QDRANT_URL", "").strip()
        qdrant_api_key = os.getenv("QDRANT_API_KEY", "").strip()

        if qdrant_url and not qdrant_url.startswith("http://localhost"):
            print(f"[QdrantVectorStore]: Connecting to Qdrant Cloud/Remote instance at {qdrant_url}")
            self.client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key if qdrant_api_key else None)
        else:
            print("[QdrantVectorStore]: Using local persistent disk storage.")
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
                print(f"[Qdrant Store Load Warning]: {e}")
        return {}

    def _save_parent_store(self):
        """Saves parent documents dictionary to pickle file."""
        try:
            with open(PARENT_STORE_PATH, "wb") as f:
                pickle.dump(self.parent_store, f)
        except Exception as e:
            print(f"[Qdrant Store Save Error]: {e}")

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

    def store_documents(self, parent_docs: List[Document], child_docs: List[Document]) -> None:
        """
        Stores Parent docs in lookup disk-file and embeds Child docs in Qdrant Disk Storage.
        """
        for p_doc in parent_docs:
            parent_id = p_doc.metadata.get("parent_id")
            if parent_id:
                self.parent_store[parent_id] = p_doc
        self._save_parent_store()

        self._ensure_collection_exists()

        self.vector_db = LangChainQdrant(
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
            self.vector_db = LangChainQdrant(
                client=self.client,
                collection_name=self.collection_name,
                embedding=self.embeddings,
            )

        matched_children = []
        try:
            matched_children = self.vector_db.similarity_search(query, k=top_k)
        except Exception as e:
            print(f"[Qdrant Search Warning]: {e}")

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
