import os
from typing import List
from app.core.embeddings import get_embeddings
from langchain_core.documents import Document
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.retrieval.base import VectorStoreInterface
from app.retrieval.models import Base, ParentDocumentModel, ChildDocumentModel

class PgVectorStore(VectorStoreInterface):
    """
    PostgreSQL + pgvector implementation of VectorStoreInterface.
    Uses native vector extension in Postgres for storing child embeddings and parent contexts.
    """

    def __init__(self, db_url: str = None):
        self.db_url = db_url or os.getenv(
            "POSTGRES_DB_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/nexus_rag"
        )
        
        self.embeddings = get_embeddings()

        self.engine = create_engine(self.db_url, echo=False)
        self.SessionLocal = sessionmaker(bind=self.engine)

        self._initialize_database()

    def _initialize_database(self):
        """Ensures vector extension and tables exist in PostgreSQL."""
        try:
            with self.engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                conn.commit()
            Base.metadata.create_all(bind=self.engine)
            print("[PgVectorStore]: Database tables and vector extension initialized successfully.")
        except Exception as e:
            print(f"[PgVectorStore Warning]: Failed to initialize database extension or tables: {e}")

    def store_documents(self, parent_docs: List[Document], child_docs: List[Document], user_id: str) -> None:
        """
        Stores Parent documents and Child vector chunks into PostgreSQL.
        """
        session = self.SessionLocal()
        try:
            # 1. Insert Parent Documents
            for p_doc in parent_docs:
                parent_id = p_doc.metadata.get("parent_id")
                if not parent_id:
                    continue

                existing_parent = session.query(ParentDocumentModel).filter_by(parent_id=parent_id).first()
                if not existing_parent:
                    parent_record = ParentDocumentModel(
                        parent_id=parent_id,
                        user_id=user_id,
                        source_file=p_doc.metadata.get("source_file", "unknown"),
                        page_number=p_doc.metadata.get("page", 1),
                        page_content=p_doc.page_content
                    )
                    session.add(parent_record)
            
            session.commit()

            # 2. Embed & Insert Child Documents
            child_texts = [c.page_content for c in child_docs]
            if child_texts:
                embeddings_list = self.embeddings.embed_documents(child_texts)

                for c_doc, emb in zip(child_docs, embeddings_list):
                    child_id = c_doc.metadata.get("child_id")
                    parent_id = c_doc.metadata.get("parent_id")
                    if not child_id or not parent_id:
                        continue

                    existing_child = session.query(ChildDocumentModel).filter_by(child_id=child_id).first()
                    if not existing_child:
                        child_record = ChildDocumentModel(
                            child_id=child_id,
                            parent_id=parent_id,
                            source_file=c_doc.metadata.get("source_file", "unknown"),
                            page_number=c_doc.metadata.get("page", 1),
                            page_content=c_doc.page_content,
                            embedding=emb
                        )
                        session.add(child_record)

                session.commit()
            print(f"[PgVectorStore]: Stored {len(parent_docs)} parents & {len(child_docs)} children in PostgreSQL.")
        except Exception as e:
            session.rollback()
            print(f"[PgVectorStore Error]: Document storage failed: {e}")
            raise e
        finally:
            session.close()

    def search_child_and_fetch_parents(self, query: str, top_k: int = 10) -> List[Document]:
        """
        Performs vector similarity search on Child chunks using Cosine Distance,
        then retrieves corresponding Parent documents from PostgreSQL.
        """
        session = self.SessionLocal()
        try:
            query_embedding = self.embeddings.embed_query(query)

            # Cosine distance order on child embeddings
            stmt = (
                select(ChildDocumentModel)
                .order_by(ChildDocumentModel.embedding.cosine_distance(query_embedding))
                .limit(top_k)
            )
            matched_children = session.scalars(stmt).all()

            seen_parent_ids = set()
            parent_ids = []
            for child in matched_children:
                if child.parent_id not in seen_parent_ids:
                    seen_parent_ids.add(child.parent_id)
                    parent_ids.append(child.parent_id)

            if not parent_ids:
                return []

            # Fetch Parent records
            parent_records = session.query(ParentDocumentModel).filter(
                ParentDocumentModel.parent_id.in_(parent_ids)
            ).all()

            parent_dict = {p.parent_id: p for p in parent_records}

            retrieved_docs: List[Document] = []
            for pid in parent_ids:
                p_rec = parent_dict.get(pid)
                if p_rec:
                    retrieved_docs.append(
                        Document(
                            page_content=p_rec.page_content,
                            metadata={
                                "parent_id": p_rec.parent_id,
                                "source_file": p_rec.source_file,
                                "page": p_rec.page_number,
                                "chunk_type": "parent"
                            }
                        )
                    )
            return retrieved_docs
        except Exception as e:
            print(f"[PgVectorStore Search Error]: {e}")
            return []
        finally:
            session.close()
