import os
import json
from typing import List, Dict, Optional
from langchain_qdrant import QdrantVectorStore as LangChainQdrant
from langchain_core.documents import Document
from qdrant_client import QdrantClient
from qdrant_client.http import models

from app.retrieval.base import VectorStoreInterface
from app.core.embeddings import get_embeddings
from app.db.database import SessionLocal
from app.db import crud

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "qdrant_storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

class QdrantVectorStore(VectorStoreInterface):
    """
    Qdrant implementation of VectorStoreInterface.
    Manages Dense Vector Storage (Qdrant Disk Persistence/Cloud) and Parent-Child retrieval using Postgres.
    """

    def __init__(self, collection_name: str = "nexus_rag_cohere"):
        self.collection_name = collection_name
        self.embeddings = get_embeddings()
        
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

    def _ensure_collection_exists(self):
        collections = self.client.get_collections().collections
        exists = any(c.name == self.collection_name for c in collections)
        
        if not exists:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=1024,
                    distance=models.Distance.COSINE
                )
            )

    def store_documents(self, parent_docs: List[Document], child_docs: List[Document]) -> None:
        """
        Stores Parent docs in PostgreSQL DB and embeds Child docs in Qdrant Storage.
        """
        db = SessionLocal()
        try:
            for p_doc in parent_docs:
                parent_id = p_doc.metadata.get("parent_id")
                if parent_id:
                    crud.save_parent_document(
                        db=db, 
                        parent_id=parent_id, 
                        content=p_doc.page_content, 
                        metadata_dict=p_doc.metadata
                    )
        finally:
            db.close()

        self._ensure_collection_exists()

        self.vector_db = LangChainQdrant(
            client=self.client,
            collection_name=self.collection_name,
            embedding=self.embeddings,
        )
        self.vector_db.add_documents(documents=child_docs)

    def search_child_and_fetch_parents(
        self, query: str, top_k: int = 10, source_file: Optional[str] = None
    ) -> List[Document]:
        """
        Performs similarity search on Child chunks, strictly filtered by source_file if provided.
        Returns parent documents retrieved from PostgreSQL.
        """
        if self.vector_db is None:
            self.vector_db = LangChainQdrant(
                client=self.client,
                collection_name=self.collection_name,
                embedding=self.embeddings,
            )

        matched_children = []
        try:
            fetch_k = top_k * 3 if source_file else top_k
            matched_children = self.vector_db.similarity_search(query, k=fetch_k)
            if source_file:
                matched_children = [
                    c for c in matched_children if c.metadata.get("source_file") == source_file
                ]
                matched_children = matched_children[:top_k]
        except Exception as e:
            print(f"[Qdrant Search Warning]: {e}")

        retrieved_parents: List[Document] = []
        seen_parent_ids = set()
        
        db = SessionLocal()
        try:
            for child in matched_children:
                parent_id = child.metadata.get("parent_id")
                if parent_id and parent_id not in seen_parent_ids:
                    seen_parent_ids.add(parent_id)
                    p_doc_record = crud.get_parent_document(db, parent_id)
                    if p_doc_record:
                        parent_doc = Document(
                            page_content=p_doc_record.content,
                            metadata=json.loads(p_doc_record.metadata_json)
                        )
                        retrieved_parents.append(parent_doc)

            if not retrieved_parents:
                candidates_records = crud.get_all_parent_documents(db)
                candidates = [
                    Document(page_content=r.content, metadata=json.loads(r.metadata_json)) 
                    for r in candidates_records
                ]
                if source_file:
                    candidates = [p for p in candidates if p.metadata.get("source_file") == source_file]
                return candidates[:5]
        finally:
            db.close()

        return retrieved_parents
