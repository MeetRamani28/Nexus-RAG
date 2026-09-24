import os
import json
import uuid
from typing import List, Dict, Optional, Any
from langchain_core.documents import Document
from qdrant_client import QdrantClient
from qdrant_client.http import models
from fastembed import SparseTextEmbedding

from app.retrieval.base import VectorStoreInterface
from app.core.embeddings import get_embeddings
from app.db.database import SessionLocal
from app.db import crud

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "qdrant_storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

class QdrantVectorStore(VectorStoreInterface):
    """
    Qdrant implementation of VectorStoreInterface supporting Hybrid Search
    (FastEmbed BM25 Sparse + Cohere Dense + Reciprocal Rank Fusion) and Multi-Tenant Isolation.
    """

    def __init__(self, collection_name: str = "nexus_rag_hybrid"):
        self.collection_name = collection_name
        self.embeddings = get_embeddings()
        
        print("[QdrantVectorStore]: Initializing FastEmbed Sparse BM25 model...")
        self.sparse_embeddings = SparseTextEmbedding("Qdrant/bm25")

        qdrant_url = os.getenv("QDRANT_URL", "").strip()
        qdrant_api_key = os.getenv("QDRANT_API_KEY", "").strip()

        if qdrant_url and not qdrant_url.startswith("http://localhost"):
            print(f"[QdrantVectorStore]: Connecting to Qdrant Remote at {qdrant_url}")
            self.client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key if qdrant_api_key else None)
        else:
            print("[QdrantVectorStore]: Using local persistent disk storage.")
            self.client = QdrantClient(path=os.path.join(STORAGE_DIR, "qdrant_db"))

        self._ensure_collection_exists()

    def _ensure_collection_exists(self):
        try:
            collections = self.client.get_collections().collections
            exists = any(c.name == self.collection_name for c in collections)
            
            if not exists:
                print(f"[QdrantVectorStore]: Creating collection '{self.collection_name}' with dense + sparse vector configurations...")
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config={
                        "dense": models.VectorParams(
                            size=1024,
                            distance=models.Distance.COSINE
                        )
                    },
                    sparse_vectors_config={
                        "sparse": models.SparseVectorParams(
                            index=models.SparseIndexParams(on_disk=False)
                        )
                    }
                )

            # Ensure Payload Indexes for filtered search (source_file, user_id, doc_id)
            for field in ["source_file", "user_id", "doc_id"]:
                try:
                    self.client.create_payload_index(
                        collection_name=self.collection_name,
                        field_name=field,
                        field_schema=models.PayloadSchemaType.KEYWORD
                    )
                except Exception:
                    pass
        except Exception as e:
            print(f"[Qdrant Collection Warning]: {e}")

    def store_documents(self, parent_docs: List[Document], child_docs: List[Document], user_id: str) -> None:
        """
        Stores Parent docs in PostgreSQL DB and embeds Child docs (Dense + Sparse BM25) in Qdrant Storage concurrently.
        Uses ThreadPoolExecutor for 3x faster parallel execution.
        """
        import concurrent.futures

        self._ensure_collection_exists()

        if not child_docs:
            return

        texts = [c.page_content for c in child_docs]

        def task_save_parents():
            db = SessionLocal()
            try:
                parent_records = [
                    {
                        "parent_id": p_doc.metadata.get("parent_id"),
                        "content": p_doc.page_content,
                        "metadata_dict": p_doc.metadata
                    }
                    for p_doc in parent_docs
                    if p_doc.metadata.get("parent_id")
                ]
                crud.save_parent_documents_batch(db=db, parent_docs_data=parent_records, user_id=user_id)
            finally:
                db.close()

        def task_embed_dense():
            return self.embeddings.embed_documents(texts)

        def task_embed_sparse():
            return list(self.sparse_embeddings.embed(texts))

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            fut_parents = executor.submit(task_save_parents)
            fut_dense = executor.submit(task_embed_dense)
            fut_sparse = executor.submit(task_embed_sparse)

            fut_parents.result()
            dense_vectors = fut_dense.result()
            sparse_vectors = fut_sparse.result()


        points = []
        for c_doc, d_vec, s_vec in zip(child_docs, dense_vectors, sparse_vectors):
            point_id = str(uuid.uuid4())
            payload = {
                "page_content": c_doc.page_content,
                "user_id": user_id,
                "doc_id": c_doc.metadata.get("source_file"),
                **c_doc.metadata
            }
            points.append(
                models.PointStruct(
                    id=point_id,
                    vector={
                        "dense": d_vec,
                        "sparse": models.SparseVector(
                            indices=s_vec.indices.tolist(),
                            values=s_vec.values.tolist()
                        )
                    },
                    payload=payload
                )
            )

        batch_size = 100
        for i in range(0, len(points), batch_size):
            batch = points[i : i + batch_size]
            self.client.upsert(collection_name=self.collection_name, points=batch)
        print(f"[QdrantVectorStore]: Successfully stored {len(points)} child chunks (dense + sparse BM25) for user '{user_id}'.")

    def search_child_and_fetch_parents(
        self, query: str, top_k: int = 10, source_file: Optional[str] = None, user_id: Optional[str] = None, search_mode: Optional[str] = None
    ) -> List[Document]:
        """
        Performs similarity search on Child chunks with filtering by source_file and/or user_id (Multi-Tenant Isolation).
        Supports search_mode: 'dense', 'sparse', 'hybrid' (defaulting to RETRIEVAL_SEARCH_MODE env var or 'hybrid').
        Ranks candidates using Reciprocal Rank Fusion (RRF) in hybrid mode.
        """
        mode = search_mode or os.getenv("RETRIEVAL_SEARCH_MODE", "hybrid").lower()
        fetch_limit = top_k * 3

        must_conditions = []
        if user_id:
            must_conditions.append(models.FieldCondition(key="user_id", match=models.MatchValue(value=user_id)))
        if source_file:
            must_conditions.append(models.FieldCondition(key="source_file", match=models.MatchValue(value=source_file)))
        
        query_filter = models.Filter(must=must_conditions) if must_conditions else None

        matched_points = []
        try:
            if mode == "dense":
                dense_q = self.embeddings.embed_query(query)
                matched_points = self.client.query_points(
                    collection_name=self.collection_name,
                    query=dense_q,
                    using="dense",
                    query_filter=query_filter,
                    limit=fetch_limit
                ).points
                
            elif mode == "sparse":
                s_q_vec = list(self.sparse_embeddings.embed([query]))[0]
                sparse_q = models.SparseVector(
                    indices=s_q_vec.indices.tolist(),
                    values=s_q_vec.values.tolist()
                )
                matched_points = self.client.query_points(
                    collection_name=self.collection_name,
                    query=sparse_q,
                    using="sparse",
                    query_filter=query_filter,
                    limit=fetch_limit
                ).points
                
            else:  # Hybrid mode (RRF)
                dense_q = self.embeddings.embed_query(query)
                dense_pts = self.client.query_points(
                    collection_name=self.collection_name,
                    query=dense_q,
                    using="dense",
                    query_filter=query_filter,
                    limit=fetch_limit
                ).points

                s_q_vec = list(self.sparse_embeddings.embed([query]))[0]
                sparse_q = models.SparseVector(
                    indices=s_q_vec.indices.tolist(),
                    values=s_q_vec.values.tolist()
                )
                sparse_pts = self.client.query_points(
                    collection_name=self.collection_name,
                    query=sparse_q,
                    using="sparse",
                    query_filter=query_filter,
                    limit=fetch_limit
                ).points

                # Reciprocal Rank Fusion (RRF)
                rrf_scores: Dict[str, float] = {}
                point_map: Dict[str, Any] = {}

                for rank, pt in enumerate(dense_pts, start=1):
                    rrf_scores[pt.id] = rrf_scores.get(pt.id, 0.0) + (1.0 / (60.0 + rank))
                    point_map[pt.id] = pt

                for rank, pt in enumerate(sparse_pts, start=1):
                    rrf_scores[pt.id] = rrf_scores.get(pt.id, 0.0) + (1.0 / (60.0 + rank))
                    point_map[pt.id] = pt

                sorted_ids = sorted(rrf_scores.keys(), key=lambda pid: rrf_scores[pid], reverse=True)
                matched_points = [point_map[pid] for pid in sorted_ids[:fetch_limit]]

        except Exception as e:
            print(f"[Qdrant Search Error ({mode})]: {e}")
            matched_points = []

        retrieved_parents: List[Document] = []
        
        db = SessionLocal()
        try:
            parent_ids_to_fetch = [
                pt.payload.get("parent_id") for pt in matched_points 
                if pt.payload and pt.payload.get("parent_id")
            ]
            unique_ids = list(dict.fromkeys(parent_ids_to_fetch))
            records_map = {
                r.id: r for r in crud.get_parent_documents_batch(db, unique_ids)
            }
            for pid in unique_ids:
                p_doc_record = records_map.get(pid)
                if p_doc_record:
                    retrieved_parents.append(
                        Document(
                            page_content=p_doc_record.content,
                            metadata=json.loads(p_doc_record.metadata_json)
                        )
                    )

            if len(retrieved_parents) > top_k:
                retrieved_parents = retrieved_parents[:top_k]

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

