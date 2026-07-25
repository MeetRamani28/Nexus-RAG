import os
from typing import List, Dict, Any
from langchain_community.vectorstores import Qdrant
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.retrievers import QdrantSparseVectorRetriever
from langchain_core.documents import Document
from qdrant_client import QdrantClient
from qdrant_client.http import models

class HybridVectorStore:
    """
    Manages Dense Vector Storage (Qdrant) and Parent-Child retrieval.
    
    Usecase:
    - Stores Child Chunks into Vector DB for dense search.
    - Maintains Parent Document map to retrieve surrounding context upon match.
    """

    def __init__(self, collection_name: str = "nexus_rag_docs"):
        self.collection_name = collection_name
        self.qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        self.qdrant_api_key = os.getenv("QDRANT_API_KEY", None)

        self.embeddings = HuggingFaceEmbeddings(
            model_name="all-MiniLM-L6-v2",
            model_kwargs={'device': 'cpu'}
        )

        self.parent_store: Dict[str, Document] = {}

        self.client = QdrantClient(
            url=self.qdrant_url,
            api_key=self.qdrant_api_key if self.qdrant_api_key else None
        )

    def store_documents(self, parent_docs: List[Document], child_docs: List[Document]):
        """
        Stores Parent docs in lookup memory and embeds Child docs in Qdrant.
        """
        for p_doc in parent_docs:
            parent_id = p_doc.metadata.get("parent_id")
            if parent_id:
                self.parent_store[parent_id] = p_doc

        self.vector_db = Qdrant.from_documents(
            documents=child_docs,
            embedding=self.embeddings,
            url=self.qdrant_url,
            api_key=self.qdrant_api_key,
            collection_name=self.collection_name,
            force_recreate=True
        )

    def search_child_and_fetch_parents(self, query: str, top_k: int = 15) -> List[Document]:
        """
        Performs similarity search on Child chunks, then fetches corresponding Parent chunks.
        Eliminates duplicate Parent chunks if multiple children hit the same parent.
        """
        if not hasattr(self, 'vector_db'):
            self.vector_db = Qdrant(
                client=self.client,
                collection_name=self.collection_name,
                embeddings=self.embeddings
            )

        matched_children = self.vector_db.similarity_search(query, k=top_k)
        
        retrieved_parents: List[Document] = []
        seen_parent_ids = set()

        for child in matched_children:
            parent_id = child.metadata.get("parent_id")
            if parent_id and parent_id not in seen_parent_ids:
                seen_parent_ids.add(parent_id)
                parent_doc = self.parent_store.get(parent_id)
                if parent_doc:
                    retrieved_parents.append(parent_doc)
                else:
                    retrieved_parents.append(child)

        return retrieved_parents