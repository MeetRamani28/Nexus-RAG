import os
from typing import Dict, Any
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from app.schemas.state import RAGState
from app.retrieval.vector_store import HybridVectorStore
from app.retrieval.reranker import RerankEngine

vector_store_instance = HybridVectorStore()
reranker_instance = RerankEngine(top_n=4)

def retrieve_node(state: RAGState) -> Dict[str, Any]:
    """
    Node 1: Retrieves candidate parent documents based on child vector search.
    """
    query = state["question"]
    retrieved_parents = vector_store_instance.search_child_and_fetch_parents(query, top_k=15)
    return {"documents": retrieved_parents}


def rerank_node(state: RAGState) -> Dict[str, Any]:
    """
    Node 2: Filters and re-orders candidate documents using Cohere Cross-Encoder.
    """
    query = state["question"]
    candidate_docs = state.get("documents", [])
    
    reranked_docs = reranker_instance.rerank_documents(query, candidate_docs)
    
    citations = []
    for doc in reranked_docs:
        citations.append({
            "source_file": doc.metadata.get("source_file", "Unknown"),
            "page_number": doc.metadata.get("page", 0) + 1,
            "content_snippet": doc.page_content[:150] + "..."
        })

    return {
        "reranked_documents": reranked_docs,
        "citation_sources": citations
    }


def generate_node(state: RAGState) -> Dict[str, Any]:
    """
    Node 3: Generates final synthesized answer using Groq LLM with context citations.
    """
    query = state["question"]
    reranked_docs = state.get("reranked_documents", [])
    
    context_str = "\n\n---\n\n".join(
        [f"[Source: {doc.metadata.get('source_file')}, Page: {doc.metadata.get('page', 0)+1}]\n{doc.page_content}" 
         for doc in reranked_docs]
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an Enterprise Document Intelligence AI (Nexus-RAG). "
                   "Answer the user's question accurately based strictly on the provided context below. "
                   "If the context does not contain enough information, state clearly that you don't know.\n\n"
                   "Context:\n{context}"),
        ("human", "{question}")
    ])

    groq_api_key = os.getenv("GROQ_API_KEY", "")
    llm = ChatGroq(
        temperature=0.1,
        model_name="llama-3.3-70b-versatile",
        groq_api_key=groq_api_key
    )

    chain = prompt | llm
    response = chain.invoke({"context": context_str, "question": query})

    return {"generation": response.content}