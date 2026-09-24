import uuid
import sys
import os

# Ensure Backend directory is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set stdout encoding to utf-8 for Windows terminal emoji compatibility
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
load_dotenv()

from app.graph.workflow import rag_graph

def test_query(question: str):
    print(f"\n--- Testing query: '{question}' ---")
    initial_state = {
        "question": question,
        "model": "qwen/qwen3.8-27b",
        "source_file": None,
        "documents": [],
        "child_documents": [],
        "reranked_documents": [],
        "web_context": "",
        "generation": "",
        "citation_sources": [],
        "error": None,
    }
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    
    print("[1] Executing RAG Graph workflow...")
    result = rag_graph.invoke(initial_state, config=config)
    
    print("\n--- Response Output ---")
    print(f"Generated Answer:\n{result.get('generation')}")
    print(f"\nCitations: {result.get('citation_sources')}")

if __name__ == "__main__":
    test_query("hello")
