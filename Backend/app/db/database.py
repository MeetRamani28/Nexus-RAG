import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# SQLite fallback for local development
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "nexus_rag.db")
DB_PATH = os.path.abspath(DB_PATH)

DATABASE_URL = os.getenv("DATABASE_URL", os.getenv("POSTGRES_DB_URL", ""))
# Fallback to SQLite if not provided
if not DATABASE_URL:
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# Force the use of psycopg3 driver for SQLAlchemy
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

print(f"[DB Setup]: DATABASE_URL starts with: {DATABASE_URL.split('://')[0]}://***")

connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
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
    if "sqlite" in DATABASE_URL:
        print(f"[DB]: SQLite database initialised at {DB_PATH}")
    else:
        print(f"[DB]: Connected to Postgres (Neon) successfully!")
