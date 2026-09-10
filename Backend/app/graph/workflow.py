from langgraph.graph import StateGraph, END
from app.schemas.state import RAGState
from app.graph.nodes import retrieve_node, rerank_node, web_search_node, generate_node

def create_rag_graph():
    """
    Constructs and compiles the modular LangGraph RAG workflow.
    Flow: START -> retrieve_node -> rerank_node -> web_search_node -> generate_node -> END
    """
    workflow = StateGraph(RAGState)

    workflow.add_node("retrieve", retrieve_node)
    workflow.add_node("rerank", rerank_node)
    workflow.add_node("web_search", web_search_node)
    workflow.add_node("generate", generate_node)

    workflow.set_entry_point("retrieve")
    workflow.add_edge("retrieve", "rerank")
    workflow.add_edge("rerank", "web_search")
    workflow.add_edge("web_search", "generate")
    workflow.add_edge("generate", END)

    app = workflow.compile()
    return app

rag_graph = create_rag_graph()