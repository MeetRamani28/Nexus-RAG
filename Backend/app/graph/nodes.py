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
    query = state.get("question", "")
    try:
        retrieved_parents = vector_store_instance.search_child_and_fetch_parents(query, top_k=10)
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

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert Enterprise Financial Document Assistant (Nexus-RAG).\n"
                   "Answer the user's query accurately using ONLY the information provided in the Context below.\n"
                   "Extract specific monetary values, figures, or dates clearly.\n\n"
                   "Context:\n{context}"),
        ("human", "{question}")
    ])

    groq_api_key = os.getenv("GROQ_API_KEY", "")
    
    try:
        llm = ChatGroq(
            temperature=0.1,
            model_name="llama-3.3-70b-versatile",
            groq_api_key=groq_api_key
        )
        chain = prompt | llm
        response = chain.invoke({"context": context_str, "question": query})
        return {"generation": str(response.content)}
    except Exception as e:
        print(f"[Groq LLM Error]: {e}")
        return {"generation": f"Error calling Groq API: {str(e)}"}