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
    questions: str
    documents: List[Document]
    child_documents: List[Document]
    reranked_documents: List[Document]
    generation: str
    citation_sources: List[Dict[str, Any]]
    error: Optional[str]