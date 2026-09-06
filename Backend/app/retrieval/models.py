from sqlalchemy import Column, String, Text, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import declarative_base, relationship
from pgvector.sqlalchemy import Vector

Base = declarative_base()

class ParentDocumentModel(Base):
    """
    Stores full Parent chunk context documents in PostgreSQL.
    """
    __tablename__ = "parent_documents"

    parent_id = Column(String(128), primary_key=True, index=True)
    source_file = Column(String(255), nullable=False)
    page_number = Column(Integer, default=1)
    page_content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    children = relationship("ChildDocumentModel", back_populates="parent", cascade="all, delete-orphan")


class ChildDocumentModel(Base):
    """
    Stores Child chunk embeddings (384 dimensions) in PostgreSQL using pgvector.
    """
    __tablename__ = "child_documents"

    child_id = Column(String(128), primary_key=True, index=True)
    parent_id = Column(String(128), ForeignKey("parent_documents.parent_id", ondelete="CASCADE"), nullable=False, index=True)
    source_file = Column(String(255), nullable=False)
    page_number = Column(Integer, default=1)
    page_content = Column(Text, nullable=False)
    embedding = Column(Vector(384), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    parent = relationship("ParentDocumentModel", back_populates="children")
