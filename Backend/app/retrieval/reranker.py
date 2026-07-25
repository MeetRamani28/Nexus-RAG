import os
from typing import List
from langchain_community.document_compressors import CohereRerank
from langchain_core.documents import Document

class RerankEngine:
    """
    Reranks candidate retrieved documents using Cohere Cross-Encoder model.
    
    Why Reranking?
    - Vector DB search yields top 15-20 chunks based purely on distance metrics.
    - Cross-Encoder evaluates deep context semantics between Query and Document.
    - Filters top 20 candidates down to top 3-5 high-relevance chunks to prevent LLM hallucinations.
    """

    def __init__(self, top_n: int = 4):
        self.cohere_api_key = os.getenv("COHERE_API_KEY", "")
        self.top_n = top_n

        if self.cohere_api_key:
            self.reranker = CohereRerank(
                cohere_api_key=self.cohere_api_key,
                model="rerank-english-v3.0",
                top_n=self.top_n
            )
        else:
            self.reranker = None

    def rerank_documents(self, query: str, documents: List[Document]) -> List[Document]:
        """
        Reranks input document list for given query.
        Falls back gracefully if API Key is not set or request fails.
        """
        if not documents:
            return []

        if not self.reranker:
            return documents[:self.top_n]

        try:
            compressed_docs = self.reranker.compress_documents(
                documents=documents,
                query=query
            )
            return list(compressed_docs)
        except Exception as e:
            print(f"[Reranker Warning]: Reranking failed ({str(e)}). Falling back to vector order.")
            return documents[:self.top_n]