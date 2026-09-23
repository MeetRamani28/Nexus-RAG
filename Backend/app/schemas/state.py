from typing import List, Dict, Any, Optional, TypedDict

class RAGState(TypedDict, total=False):
    """
    Central State passed between LangGraph nodes in Nexus-RAG.

    Attributes:
        question: User's raw input query.
        user_id: Authenticated user ID.
        user_role: User role ('free', 'pro', 'admin') for RBAC gating.
        model: Selected LLM model name.
        source_file: Filter document ID.
        documents: List of Parent Documents retrieved.
        child_documents: Small chunks used for vector search.
        reranked_documents: Top documents selected by Cohere Cross-Encoder.
        web_context: Web search results if RAG context is insufficient.
        generation: Final response text from LLM.
        citation_sources: Source metadata (filename, page numbers, snippets).
        error: Optional error context string if any step fails.
    """
    question: str
    user_id: Optional[str]
    user_role: Optional[str]
    model: Optional[str]
    source_file: Optional[str]
    documents: List[Any]
    child_documents: List[Any]
    reranked_documents: List[Any]
    web_context: str
    generation: str
    citation_sources: List[Dict[str, Any]]
    error: Optional[str]