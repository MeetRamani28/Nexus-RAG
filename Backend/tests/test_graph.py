import os
import sys
import pytest
from dotenv import load_dotenv

load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.graph.workflow import rag_graph

def test_rag_graph_execution():
    query = "What is the capital of France?"
    state_input = {
        "question": query,
        "source_file": None,
        "user_role": "free"
    }
    
    config = {"configurable": {"thread_id": "test_thread_001"}}
    result = rag_graph.invoke(state_input, config=config)
    
    assert "generation" in result
    assert result["generation"] is not None
    assert len(result["generation"]) > 0
