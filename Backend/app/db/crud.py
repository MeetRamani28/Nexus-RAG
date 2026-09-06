import json
from typing import List, Optional
from sqlalchemy.orm import Session
from app.db.models import Conversation, Message, IngestedDocument


# ─────────────────────────────────────────────
# Conversation CRUD
# ─────────────────────────────────────────────

def create_conversation(db: Session, title: str = "New Conversation") -> Conversation:
    conv = Conversation(title=title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def list_conversations(db: Session) -> List[Conversation]:
    return db.query(Conversation).order_by(Conversation.updated_at.desc()).all()


def get_conversation(db: Session, conversation_id: str) -> Optional[Conversation]:
    return db.query(Conversation).filter(Conversation.id == conversation_id).first()


def update_conversation_title(db: Session, conversation_id: str, title: str) -> Optional[Conversation]:
    conv = get_conversation(db, conversation_id)
    if not conv:
        return None
    conv.title = title[:150]  # cap at 150 chars
    db.commit()
    db.refresh(conv)
    return conv


def update_conversation_source_file(db: Session, conversation_id: str, filename: str) -> Optional[Conversation]:
    conv = get_conversation(db, conversation_id)
    if not conv:
        return None
    conv.source_file = filename
    if conv.title == "New Conversation":
        conv.title = filename.replace(".pdf", "").replace("_", " ").title()
    db.commit()
    db.refresh(conv)
    return conv


def delete_conversation(db: Session, conversation_id: str) -> bool:
    conv = get_conversation(db, conversation_id)
    if not conv:
        return False
    db.delete(conv)
    db.commit()
    return True


# ─────────────────────────────────────────────
# Message CRUD
# ─────────────────────────────────────────────

def add_message(
    db: Session,
    conversation_id: str,
    role: str,
    content: str,
    citations: Optional[list] = None,
) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        citations_json=json.dumps(citations or []),
    )
    db.add(msg)

    # Auto-update conversation title from first user message
    if role == "user":
        conv = get_conversation(db, conversation_id)
        if conv and conv.title == "New Conversation":
            conv.title = content[:80]

    db.commit()
    db.refresh(msg)
    return msg


def get_messages(db: Session, conversation_id: str) -> List[Message]:
    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )


# ─────────────────────────────────────────────
# IngestedDocument CRUD
# ─────────────────────────────────────────────

def doc_exists_by_hash(db: Session, file_hash: str) -> Optional[IngestedDocument]:
    return db.query(IngestedDocument).filter(IngestedDocument.file_hash == file_hash).first()


def save_ingested_doc(
    db: Session, filename: str, file_hash: str, parent_chunks: int, child_chunks: int
) -> IngestedDocument:
    doc = IngestedDocument(
        filename=filename,
        file_hash=file_hash,
        parent_chunks=parent_chunks,
        child_chunks=child_chunks,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def list_ingested_docs(db: Session) -> List[IngestedDocument]:
    return db.query(IngestedDocument).order_by(IngestedDocument.ingested_at.desc()).all()


def delete_ingested_doc(db: Session, filename: str) -> bool:
    doc = db.query(IngestedDocument).filter(IngestedDocument.filename == filename).first()
    if not doc:
        return False
    db.delete(doc)
    db.commit()
    return True

# ---------------------------------------------
# Parent Document CRUD
# ---------------------------------------------

from app.db.models import ParentDocument

def save_parent_document(db: Session, parent_id: str, content: str, metadata_dict: dict) -> ParentDocument:
    doc = db.query(ParentDocument).filter(ParentDocument.id == parent_id).first()
    if not doc:
        doc = ParentDocument(id=parent_id)
        db.add(doc)
    doc.content = content
    doc.metadata_json = json.dumps(metadata_dict)
    db.commit()
    db.refresh(doc)
    return doc

def get_parent_document(db: Session, parent_id: str) -> Optional[ParentDocument]:
    return db.query(ParentDocument).filter(ParentDocument.id == parent_id).first()

def get_all_parent_documents(db: Session) -> List[ParentDocument]:
    return db.query(ParentDocument).all()

