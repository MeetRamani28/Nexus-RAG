from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime


# ─── Ingest ───────────────────────────────────────────────────────────────────

class DocumentIngestResponse(BaseModel):
    status: str = Field(..., example="success")
    filename: str = Field(..., example="q3_financial_report.pdf")
    parent_chunks_created: int = Field(..., example=12)
    child_chunks_created: int = Field(..., example=55)
    message: str = Field(..., example="Document ingested and indexed successfully.")
    duplicate: bool = Field(default=False)


# ─── Query ────────────────────────────────────────────────────────────────────

class Citation(BaseModel):
    source_file: str
    page_number: int
    content_snippet: str


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=3, example="What was the Q3 revenue growth?")
    top_k: Optional[int] = Field(default=5, ge=1, le=10)
    conversation_id: Optional[str] = Field(default=None, description="Active conversation ID for history saving")
    model: Optional[str] = Field(default=None, description="Selected LLM model ID")


class QueryResponse(BaseModel):
    question: str
    answer: str
    citations: List[Citation]
    execution_time_seconds: float


# ─── Conversations ────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    title: Optional[str] = Field(default="New Conversation")


class ConversationTitleUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    citations: List[Dict[str, Any]] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationListItem(BaseModel):
    id: str
    title: str
    source_file: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    class Config:
        from_attributes = True


class ConversationDetail(BaseModel):
    id: str
    title: str
    source_file: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []

    class Config:
        from_attributes = True


# ─── Documents ───────────────────────────────────────────────────────────────

class IngestedDocumentResponse(BaseModel):
    id: str
    filename: str
    parent_chunks: int
    child_chunks: int
    ingested_at: datetime

    class Config:
        from_attributes = True
