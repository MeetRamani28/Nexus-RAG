import os
from typing import Dict, Any
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langgraph.types import interrupt
from duckduckgo_search import DDGS

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
    user_id = state.get("user_id")
    try:
        search_query = hyde_engine.generate_hypothetical_document(query)
        retrieved_parents = vector_store_instance.search_child_and_fetch_parents(
            search_query, top_k=10, source_file=source_file, user_id=user_id
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

    if len(candidate_docs) <= 3:
        reranked_docs = candidate_docs
    else:
        try:
            reranked_docs = reranker_instance.rerank_documents(query, candidate_docs[:4])
            if not reranked_docs:
                reranked_docs = candidate_docs[:3]
        except Exception as e:
            print(f"[Rerank Fallback]: {e}")
            reranked_docs = candidate_docs[:3]

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


def web_search_node(state: RAGState) -> Dict[str, Any]:
    query = state.get("question", "")
    reranked_docs = state.get("reranked_documents", [])
    user_role = (state.get("user_role") or "free").lower()
    
    # Skip web search if document context is strong
    if len(reranked_docs) > 0 and len(reranked_docs[0].page_content) > 100:
        return {"web_context": ""}

    # Task 5 RBAC Gating: Free tier users cannot perform web search
    if user_role not in ["pro", "admin"]:
        print(f"[RBAC Gating]: Web search restricted for user role '{user_role}'. Upgrade to Pro for live web retrieval.")
        return {"web_context": "[Notice: Web search fallback is restricted on your current plan. Upgrade to Pro/Admin to enable live web retrieval.]"}

    # Task 5 HITL Interrupt: Require user approval before searching web
    try:
        approval = interrupt({
            "action": "web_search_approval",
            "query": query,
            "reason": "PDF context insufficient. Human approval requested before performing external web search."
        })
        
        if isinstance(approval, dict) and not approval.get("approved", False):
            print("[HITL Approval]: Web search declined by user.")
            return {"web_context": ""}
    except Exception as e:
        print(f"[HITL Notice]: Continuing standard web search flow ({e})")
        
    try:
        results = DDGS().text(query, max_results=3)
        web_context = "\n".join([f"[Web] {r['title']}: {r['body']}" for r in results])
        return {"web_context": web_context}
    except Exception as e:
        print(f"[Web Search Error]: {e}")
        return {"web_context": ""}


def generate_node(state: RAGState) -> Dict[str, Any]:
    query = state.get("question", "")
    reranked_docs = state.get("reranked_documents", [])
    web_context = state.get("web_context", "")
    
    if not reranked_docs:
        reranked_docs = state.get("documents", [])

    if not reranked_docs and not web_context:
        return {"generation": "No relevant context was found in the ingested documents to answer your query."}

    context_str = "\n\n---\n\n".join(
        [f"[Source: {doc.metadata.get('source_file')}, Page: {doc.metadata.get('page', 1)}]\n{doc.page_content}" 
         for doc in reranked_docs]
    )

    if web_context:
        context_str += f"\n\n--- WEB CONTEXT ---\n{web_context}"

    MAX_CONTEXT_CHARS = 6000
    if len(context_str) > MAX_CONTEXT_CHARS:
        context_str = context_str[:MAX_CONTEXT_CHARS] + "\n\n[Context truncated for token limit...]"

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are Nexus-RAG, an Enterprise-grade Document Intelligence Assistant.\n"
                   "Answer the user's query factually, concisely, and directly based on the provided Context.\n"
                   "Structure your answer cleanly using rich Markdown: bullet points, bold key terms or metrics, and short informative paragraphs.\n"
                   "If the context does not contain enough information, state that clearly and succinctly without hallucinating.\n\n"
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
            max_tokens=1024,
        )
        chain = prompt | llm
        response = chain.invoke({"context": context_str, "question": query})
        return {"generation": str(response.content)}
    except Exception as primary_err:
        print(f"[Groq LLM Warning]: Primary model '{active_model}' failed ({primary_err}). Attempting automatic fallback...")
        try:
            from app.llm_manager import fetch_active_groq_models
            available = fetch_active_groq_models(groq_api_key)
            fallback_model = next((m for m in available if m != active_model), "openai/gpt-oss-20b")
            
            print(f"[Groq LLM Fallback]: Retrying with alternative active model '{fallback_model}'...")
            fallback_llm = ChatGroq(
                temperature=0.1,
                model_name=fallback_model,
                groq_api_key=groq_api_key,
                max_tokens=1024,
            )
            fallback_chain = prompt | fallback_llm
            response = fallback_chain.invoke({"context": context_str, "question": query})
            return {"generation": str(response.content)}
        except Exception as fallback_err:
            print(f"[Groq LLM Error]: Both primary and fallback models failed: {fallback_err}")
            return {"generation": f"Error calling Groq API: {str(primary_err)}"}