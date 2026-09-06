from abc import ABC, abstractmethod
from typing import List
from langchain_core.documents import Document

class VectorStoreInterface(ABC):
    """
    Abstract Base Class for Vector Store Backends in Nexus-RAG.
    Supports storing hierarchical Parent-Child documents and retrieving parents via child search.
    """

    @abstractmethod
    def store_documents(self, parent_docs: List[Document], child_docs: List[Document]) -> None:
        """
        Stores Parent context documents and indexes Child vector chunks.
        """
        pass

    @abstractmethod
    def search_child_and_fetch_parents(self, query: str, top_k: int = 10) -> List[Document]:
        """
        Performs similarity search on child chunks and returns parent documents.
        """
        pass
