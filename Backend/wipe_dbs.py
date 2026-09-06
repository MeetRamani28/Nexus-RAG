import os
import asyncio
from dotenv import load_dotenv
load_dotenv()

# Wipe Redis
try:
    import redis
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        r = redis.from_url(redis_url)
        r.flushall()
        print("Redis Flushed")
    else:
        print("No REDIS_URL found")
except Exception as e:
    print(f"Redis Error: {e}")

# Wipe Postgres
try:
    from app.db.database import SessionLocal, engine
    from app.db.models import Base
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("Postgres Flushed")
except Exception as e:
    print(f"Postgres Error: {e}")

# Wipe Qdrant
try:
    from qdrant_client import QdrantClient
    qdrant_url = os.getenv("QDRANT_URL")
    qdrant_key = os.getenv("QDRANT_API_KEY")
    if qdrant_url:
        client = QdrantClient(url=qdrant_url, api_key=qdrant_key)
        client.delete_collection("nexus_rag_parents")
        client.delete_collection("nexus_rag_children")
        print("Qdrant Flushed")
    else:
        print("No QDRANT_URL found")
except Exception as e:
    print(f"Qdrant Error: {e}")
