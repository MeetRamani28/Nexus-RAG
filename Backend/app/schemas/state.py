from typing import List, Dict, Any, Optional, TypedDict, Annotated
import operator
from langchain_core.documents import Document

class RAGState(TypedDict):
    """
    Central State passed between LangGraph nodes in Nexus-RAG.

    Attributes:
        questions: User's raw input query.
        documents: List of Parent Documents retrieved and reranked.
        child_documents: Small chunks used for vector search.
        reranked_documents: Top 3-5 documents selected by Cohere Cross-Encoder.
        generation: Final streamed response text from LLM.
        citation_sources: Source metadata (filename, page numbers, chunk IDs).
        error: Optional error context string if any step fails.
    """
    question: str
    model: Optional[str]
    source_file: Optional[str]
    documents: List[Any]
    child_documents: List[Any]
    reranked_documents: List[Any]
    web_context: str
    generation: str
    citation_sources: List[Dict[str, Any]]
    error: Optional[str]