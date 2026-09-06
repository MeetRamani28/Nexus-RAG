import re

# Update crud.py
with open("app/db/crud.py", "r") as f:
    crud_content = f.read()

# Make all crud functions take user_id and filter by it
crud_content = crud_content.replace(
    "def create_conversation(db: Session, title: str = \"New Conversation\") -> Conversation:",
    "def create_conversation(db: Session, user_id: str, title: str = \"New Conversation\") -> Conversation:\n    from app.db.crud import create_or_update_user\n    create_or_update_user(db, user_id, \"user@example.com\")"
)
crud_content = crud_content.replace(
    "conv = Conversation(title=title)",
    "conv = Conversation(title=title, user_id=user_id)"
)
crud_content = crud_content.replace(
    "def list_conversations(db: Session) -> List[Conversation]:\n    return db.query(Conversation).order_by(Conversation.updated_at.desc()).all()",
    "def list_conversations(db: Session, user_id: str) -> List[Conversation]:\n    return db.query(Conversation).filter(Conversation.user_id == user_id).order_by(Conversation.updated_at.desc()).all()"
)
crud_content = crud_content.replace(
    "def get_conversation(db: Session, conversation_id: str) -> Optional[Conversation]:\n    return db.query(Conversation).filter(Conversation.id == conversation_id).first()",
    "def get_conversation(db: Session, conversation_id: str, user_id: str) -> Optional[Conversation]:\n    return db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == user_id).first()"
)
crud_content = crud_content.replace(
    "def update_conversation_title(db: Session, conversation_id: str, title: str) -> Optional[Conversation]:\n    conv = get_conversation(db, conversation_id)",
    "def update_conversation_title(db: Session, conversation_id: str, title: str, user_id: str) -> Optional[Conversation]:\n    conv = get_conversation(db, conversation_id, user_id)"
)
crud_content = crud_content.replace(
    "def update_conversation_source_file(db: Session, conversation_id: str, filename: str) -> Optional[Conversation]:\n    conv = get_conversation(db, conversation_id)",
    "def update_conversation_source_file(db: Session, conversation_id: str, filename: str, user_id: str) -> Optional[Conversation]:\n    conv = get_conversation(db, conversation_id, user_id)"
)
crud_content = crud_content.replace(
    "def delete_conversation(db: Session, conversation_id: str) -> bool:\n    conv = get_conversation(db, conversation_id)",
    "def delete_conversation(db: Session, conversation_id: str, user_id: str) -> bool:\n    conv = get_conversation(db, conversation_id, user_id)"
)
crud_content = crud_content.replace(
    "def add_message(\n    db: Session,\n    conversation_id: str,\n    role: str,\n    content: str,\n    citations: Optional[list] = None,\n) -> Message:",
    "def add_message(\n    db: Session,\n    conversation_id: str,\n    user_id: str,\n    role: str,\n    content: str,\n    citations: Optional[list] = None,\n) -> Message:"
)
crud_content = crud_content.replace(
    "conv = get_conversation(db, conversation_id)",
    "conv = get_conversation(db, conversation_id, user_id)"
)
crud_content = crud_content.replace(
    "def save_ingested_doc(\n    db: Session, filename: str, file_hash: str, parent_chunks: int, child_chunks: int\n) -> IngestedDocument:",
    "def save_ingested_doc(\n    db: Session, filename: str, file_hash: str, parent_chunks: int, child_chunks: int, user_id: str\n) -> IngestedDocument:"
)
crud_content = crud_content.replace(
    "doc = IngestedDocument(\n        filename=filename,\n        file_hash=file_hash,",
    "doc = IngestedDocument(\n        filename=filename,\n        file_hash=file_hash,\n        user_id=user_id,"
)
crud_content = crud_content.replace(
    "def list_ingested_docs(db: Session) -> List[IngestedDocument]:\n    return db.query(IngestedDocument).order_by(IngestedDocument.ingested_at.desc()).all()",
    "def list_ingested_docs(db: Session, user_id: str) -> List[IngestedDocument]:\n    return db.query(IngestedDocument).filter(IngestedDocument.user_id == user_id).order_by(IngestedDocument.ingested_at.desc()).all()"
)
crud_content = crud_content.replace(
    "def delete_ingested_doc(db: Session, filename: str) -> bool:\n    doc = db.query(IngestedDocument).filter(IngestedDocument.filename == filename).first()",
    "def delete_ingested_doc(db: Session, filename: str, user_id: str) -> bool:\n    doc = db.query(IngestedDocument).filter(IngestedDocument.filename == filename, IngestedDocument.user_id == user_id).first()"
)
crud_content = crud_content.replace(
    "def save_parent_document(db: Session, parent_id: str, content: str, metadata_dict: dict) -> ParentDocument:",
    "def save_parent_document(db: Session, parent_id: str, content: str, metadata_dict: dict, user_id: str) -> ParentDocument:"
)
crud_content = crud_content.replace(
    "doc = ParentDocument(id=parent_id)",
    "doc = ParentDocument(id=parent_id, user_id=user_id)"
)
with open("app/db/crud.py", "w") as f:
    f.write(crud_content)

# Update main.py
with open("app/main.py", "r") as f:
    main_content = f.read()

main_content = main_content.replace("from app.db import crud", "from app.db import crud\nfrom app.auth import get_current_user_id")
main_content = main_content.replace("def list_conversations(db: Session = Depends(get_db)):", "def list_conversations(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):")
main_content = main_content.replace("convs = crud.list_conversations(db)", "convs = crud.list_conversations(db, user_id)")

main_content = main_content.replace("def create_conversation(payload: ConversationCreate, db: Session = Depends(get_db)):", "def create_conversation(payload: ConversationCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):")
main_content = main_content.replace("conv = crud.create_conversation(db, title=payload.title or \"New Conversation\")", "conv = crud.create_conversation(db, user_id, title=payload.title or \"New Conversation\")")

main_content = main_content.replace("def get_conversation(conversation_id: str, db: Session = Depends(get_db)):", "def get_conversation(conversation_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):")
main_content = main_content.replace("conv = crud.get_conversation(db, conversation_id)", "conv = crud.get_conversation(db, conversation_id, user_id)")

main_content = main_content.replace("def rename_conversation(conversation_id: str, payload: ConversationTitleUpdate, db: Session = Depends(get_db)):", "def rename_conversation(conversation_id: str, payload: ConversationTitleUpdate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):")
main_content = main_content.replace("conv = crud.update_conversation_title(db, conversation_id, payload.title)", "conv = crud.update_conversation_title(db, conversation_id, payload.title, user_id)")

main_content = main_content.replace("def attach_document_to_conversation(\n    conversation_id: str, filename: str, db: Session = Depends(get_db)\n):", "def attach_document_to_conversation(\n    conversation_id: str, filename: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)\n):")
main_content = main_content.replace("conv = crud.update_conversation_source_file(db, conversation_id, filename)", "conv = crud.update_conversation_source_file(db, conversation_id, filename, user_id)")

main_content = main_content.replace("def delete_conversation(conversation_id: str, db: Session = Depends(get_db)):", "def delete_conversation(conversation_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):")
main_content = main_content.replace("success = crud.delete_conversation(db, conversation_id)", "success = crud.delete_conversation(db, conversation_id, user_id)")

main_content = main_content.replace("def list_documents(db: Session = Depends(get_db)):", "def list_documents(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):")
main_content = main_content.replace("return crud.list_ingested_docs(db)", "return crud.list_ingested_docs(db, user_id)")

main_content = main_content.replace("def delete_document(filename: str, db: Session = Depends(get_db)):", "def delete_document(filename: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):")
main_content = main_content.replace("success = crud.delete_ingested_doc(db, filename)", "success = crud.delete_ingested_doc(db, filename, user_id)")

main_content = main_content.replace("db: Session = Depends(get_db)\n):", "db: Session = Depends(get_db),\n    user_id: str = Depends(get_current_user_id)\n):")
main_content = main_content.replace("crud.update_conversation_source_file(db, conversation_id, file.filename)", "crud.update_conversation_source_file(db, conversation_id, file.filename, user_id)")
main_content = main_content.replace("child_chunks=len(child_docs),", "child_chunks=len(child_docs),\n            user_id=user_id,")

main_content = main_content.replace("async def stream_query(request: Request, payload: QueryRequest, db: Session = Depends(get_db)):", "async def stream_query(request: Request, payload: QueryRequest, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):")
main_content = main_content.replace("conv = crud.get_conversation(db, payload.conversation_id)", "conv = crud.get_conversation(db, payload.conversation_id, user_id)")
main_content = main_content.replace("crud.add_message(db, payload.conversation_id, \"user\", payload.question)", "crud.add_message(db, payload.conversation_id, user_id, \"user\", payload.question)")
main_content = main_content.replace("crud.add_message(db, payload.conversation_id, \"assistant\", cached_generation, cached_citations)", "crud.add_message(db, payload.conversation_id, user_id, \"assistant\", cached_generation, cached_citations)")
main_content = main_content.replace("crud.add_message(db, payload.conversation_id, \"assistant\", generation_text, citations)", "crud.add_message(db, payload.conversation_id, user_id, \"assistant\", generation_text, citations)")

with open("app/main.py", "w") as f:
    f.write(main_content)

print("Backend updated successfully!")
