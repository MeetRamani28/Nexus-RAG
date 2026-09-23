import uuid
import hashlib
from typing import List, Tuple
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25MB Limit

def compute_file_hash(file_bytes: bytes) -> str:
    """Returns MD5 hex digest of file bytes for duplicate detection."""
    return hashlib.md5(file_bytes).hexdigest()

def validate_file_size(file_bytes: bytes) -> bool:
    """Checks if file exceeds maximum 25MB limit."""
    return len(file_bytes) <= MAX_FILE_SIZE_BYTES


class PDFIngestionEngine:
    """
    Handles PDF loading, scanned PDF detection, and Parent-Child Chunking strategy.
    Optimised for financial tables & dense documents.
    """

    def __init__(
        self,
        parent_chunk_size: int = 2000,
        child_chunk_size: int = 400,
        chunk_overlap: int = 100,
    ):
        self.parent_splitter = RecursiveCharacterTextSplitter(
            chunk_size=parent_chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", "  ", " ", ""],
        )
        self.child_splitter = RecursiveCharacterTextSplitter(
            chunk_size=child_chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", "  ", " ", ""],
        )

    def load_pdf(self, file_path: str) -> List[Document]:
        """Loads raw text pages from a PDF file using PyPDFLoader and validates text content."""
        loader = PyPDFLoader(file_path)
        docs = loader.load()

        total_text_length = sum(len(d.page_content.strip()) for d in docs)
        if total_text_length < 20 and len(docs) > 0:
            print(f"[PDF Processor Warning]: Scanned image PDF detected for '{file_path}'. Low selectable text.")
            for i, d in enumerate(docs):
                if not d.page_content.strip():
                    d.page_content = f"[Scanned Page {i+1}]: Image PDF with no extractable text. High-precision extraction requires OCR."

        return docs

    def create_parent_child_chunks(
        self, documents: List[Document], filename: str
    ) -> Tuple[List[Document], List[Document]]:
        """Splits raw document pages into Parent and Child documents."""
        parent_docs: List[Document] = []
        child_docs: List[Document] = []

        valid_docs = [d for d in documents if d.page_content and len(d.page_content.strip()) > 0]
        if not valid_docs:
            valid_docs = documents

        raw_parents = self.parent_splitter.split_documents(valid_docs)

        for parent in raw_parents:
            parent_id = f"{filename}_parent_{uuid.uuid4().hex[:8]}"
            page_num = parent.metadata.get("page", 0) + 1 if "page" in parent.metadata else 1

            parent_metadata = {
                "parent_id": parent_id,
                "source_file": filename,
                "page": page_num,
                "chunk_type": "parent",
            }
            parent_doc = Document(page_content=parent.page_content, metadata=parent_metadata)
            parent_docs.append(parent_doc)

            children = self.child_splitter.split_documents([parent_doc])
            for c_idx, child in enumerate(children):
                child_metadata = {
                    "child_id": f"{parent_id}_child_{c_idx}",
                    "parent_id": parent_id,
                    "source_file": filename,
                    "page": page_num,
                    "chunk_type": "child",
                }
                child_docs.append(Document(page_content=child.page_content, metadata=child_metadata))

        return parent_docs, child_docs
