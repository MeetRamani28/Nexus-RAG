from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class QueryRequest(BaseModel):
    """Payload sent by React Frontend for asking a question."""
    question: str = Field(..., min_length=3, description="User's query string", example="What was the Q3 revenue growth?")
    top_k: Optional[int] = Field(default=5, ge=1, le=10, description="Number of reranked context chunks to feed to LLM")

class DocumentIngestResponse(BaseModel):
    """Response returned after processing and vectorizing a PDF file."""
    status: str = Field(..., example="success")
    filename: str = Field(..., example="q3_financial_report.pdf")
    parent_chunks_created: int = Field(..., example=12)
    child_chunks_created: int = Field(..., example=55)
    message: str = Field(..., example="Document ingested and indexed successfully.")

class Citation(BaseModel):
    """Citation metadata for frontend rendering."""
    source_file: str
    page_number: int
    content_snippet: str

class QueryResponse(BaseModel):
    """Final output response schema for non-streaming calls."""
    question: str
    answer: str
    citations: List[Citation]
    execution_time_seconds: float