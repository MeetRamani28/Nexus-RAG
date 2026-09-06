import os
from typing import Dict, Any
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from app.schemas.state import RAGState
from app.retrieval.factory import get_vector_store
from app.retrieval.reranker import RerankEngine
from app.retrieval.hyde import HyDEEngine
from app.llm_manager import get_active_llm_model_name

vector_store_instance = get_vector_store()
reranker_instance = RerankEngine(top_n=4)
hyde_engine = HyDEEngine()

def retrieve_node(state: RAGState) -> Dict[str, Any]:
    query = state.get("question", "")
    source_file = state.get("source_file")
    try:
        search_query = hyde_engine.generate_hypothetical_document(query)
        retrieved_parents = vector_store_instance.search_child_and_fetch_parents(
            search_query, top_k=10, source_file=source_file
        )
        return {"documents": retrieved_parents}
    except Exception as e:
        print(f"[Retrieve Error]: {e}")
        return {"documents": []}


def rerank_node(state: RAGState) -> Dict[str, Any]:
    query = state.get("question", "")
    candidate_docs = state.get("documents", [])
    
    if not candidate_docs:
        return {"reranked_documents": [], "citation_sources": []}

    try:
        reranked_docs = reranker_instance.rerank_documents(query, candidate_docs)
        if not reranked_docs:
            reranked_docs = candidate_docs[:4]
    except Exception as e:
        print(f"[Rerank Fallback]: {e}")
        reranked_docs = candidate_docs[:4]

    citations = []
    for doc in reranked_docs:
        citations.append({
            "source_file": doc.metadata.get("source_file", "Unknown"),
            "page_number": doc.metadata.get("page", 1),
            "content_snippet": doc.page_content[:150] + "..."
        })

    return {
        "reranked_documents": reranked_docs,
        "citation_sources": citations
    }


def generate_node(state: RAGState) -> Dict[str, Any]:
    query = state.get("question", "")
    reranked_docs = state.get("reranked_documents", [])
    
    if not reranked_docs:
        reranked_docs = state.get("documents", [])

    if not reranked_docs:
        return {"generation": "No relevant context was found in the ingested documents to answer your query."}

    context_str = "\n\n---\n\n".join(
        [f"[Source: {doc.metadata.get('source_file')}, Page: {doc.metadata.get('page', 1)}]\n{doc.page_content}" 
         for doc in reranked_docs]
    )

    # Truncate context to max 6000 chars to stay within Groq token limits
    MAX_CONTEXT_CHARS = 6000
    if len(context_str) > MAX_CONTEXT_CHARS:
        context_str = context_str[:MAX_CONTEXT_CHARS] + "\n\n[Context truncated for token limit...]"

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert Enterprise Financial Document Assistant (Nexus-RAG).\n"
                   "Answer the user's query accurately using ONLY the information provided in the Context below.\n"
                   "Extract specific monetary values, figures, or dates clearly.\n\n"
                   "Context:\n{context}"),
        ("human", "{question}")
    ])

    groq_api_key = os.getenv("GROQ_API_KEY", "")
    active_model = state.get("model") or get_active_llm_model_name()
    
    try:
        llm = ChatGroq(
            temperature=0.1,
            model_name=active_model,
            groq_api_key=groq_api_key,
            max_tokens=1024,  # cap to avoid OTPM rate limit errors
        )
        chain = prompt | llm
        response = chain.invoke({"context": context_str, "question": query})
        return {"generation": str(response.content)}
    except Exception as primary_err:
        print(f"[Groq LLM Warning]: Primary model '{active_model}' failed ({primary_err}). Attempting automatic fallback...")
        try:
            from app.llm_manager import fetch_active_groq_models
            available = fetch_active_groq_models(groq_api_key)
            fallback_model = next((m for m in available if m != active_model), "llama-3.1-8b-instant")
            
            print(f"[Groq LLM Fallback]: Retrying with alternative active model '{fallback_model}'...")
            fallback_llm = ChatGroq(
                temperature=0.1,
                model_name=fallback_model,
                groq_api_key=groq_api_key,
                max_tokens=1024,  # cap to avoid OTPM rate limit errors
            )
            fallback_chain = prompt | fallback_llm
            response = fallback_chain.invoke({"context": context_str, "question": query})
            return {"generation": str(response.content)}
        except Exception as fallback_err:
            print(f"[Groq LLM Error]: Both primary and fallback models failed: {fallback_err}")
            return {"generation": f"Error calling Groq API: {str(primary_err)}"}