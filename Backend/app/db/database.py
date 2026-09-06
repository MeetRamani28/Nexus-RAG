import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# SQLite file stored in Backend directory
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "nexus_rag.db")
DB_PATH = os.path.abspath(DB_PATH)

DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite with FastAPI
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Creates all tables if they do not exist. Called at app startup."""
    from app.db import models  # noqa: F401 — import triggers model registration
    Base.metadata.create_all(bind=engine)
    print(f"[DB]: SQLite database initialised at {DB_PATH}")
