import uuid
from typing import List, Tuple, Dict, Any
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

class PDFIngestionEngine:
    """
    Handles PDF loading and Parent-Child Chunking strategy.
    
    Why Parent-Child Chunking?
    - Child chunks (200 tokens) allow vector search to match exact semantic concepts.
    - Parent chunks (1000 tokens) provide full context to the LLM, preventing truncated answers.
    """
    
    def __init__(self, parent_chunk_size: int = 1000, child_chunk_size: int = 200, chunk_overlap: int = 50):
        self.parent_splitter = RecursiveCharacterTextSplitter(
            chunk_size=parent_chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", " ", ""]
        )
        self.child_splitter = RecursiveCharacterTextSplitter(
            chunk_size=child_chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", " ", ""]
        )

    def load_pdf(self, file_path: str) -> List[Document]:
        """Loads raw text pages from a PDF file using PyPDFLoader."""
        loader = PyPDFLoader(file_path)
        return loader.load()

    def create_parent_child_chunks(
        self, documents: List[Document], filename: str
    ) -> Tuple[List[Document], List[Document]]:
        """
        Splits raw document pages into Parent and Child documents, linking them via metadata.
        
        Returns:
            Tuple of (parent_docs, child_docs)
        """
        parent_docs: List[Document] = []
        child_docs: List[Document] = []

        raw_parents = self.parent_splitter.split_documents(documents)

        for p_idx, parent in enumerate(raw_parents):
            parent_id = f"{filename}_parent_{uuid.uuid4().hex[:8]}"
            
            parent_metadata = {
                **parent.metadata,
                "parent_id": parent_id,
                "source_file": filename,
                "chunk_type": "parent"
            }
            parent_doc = Document(page_content=parent.page_content, metadata=parent_metadata)
            parent_docs.append(parent_doc)

            children = self.child_splitter.split_documents([parent_doc])
            
            for c_idx, child in enumerate(children):
                child_id = f"{parent_id}_child_{c_idx}"
                child_metadata = {
                    **child.metadata,
                    "child_id": child_id,
                    "parent_id": parent_id, 
                    "source_file": filename,
                    "chunk_type": "child"
                }
                child_docs.append(Document(page_content=child.page_content, metadata=child_metadata))

        return parent_docs, child_docs