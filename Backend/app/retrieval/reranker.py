import os
from typing import List
from langchain_cohere import CohereRerank
from langchain_core.documents import Document

class RerankEngine:
    """
    Reranks candidate retrieved documents using Cohere Cross-Encoder model.
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

        import concurrent.futures

        def _do_rerank():
            return list(self.reranker.compress_documents(documents=documents, query=query))

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                fut = executor.submit(_do_rerank)
                return fut.result(timeout=1.0)
        except Exception as e:
            print(f"[Reranker Fast-Fallback]: Reranking timed out or failed ({e}). Using vector order instantly.")
            return documents[:self.top_n]