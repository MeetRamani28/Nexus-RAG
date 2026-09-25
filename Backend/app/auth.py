import jwt
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

def get_current_user_id(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> str:
    token = credentials.credentials
    try:
        decoded = jwt.decode(token, options={"verify_signature": False})
        user_id = decoded.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Sync user email if provided via header or JWT
        user_email = (
            request.headers.get("x-user-email")
            or decoded.get("email")
            or decoded.get("primary_email_address")
            or ""
        ).strip().lower()

        if user_email and "@" in user_email:
            try:
                from app.db.database import SessionLocal
                from app.db.crud import sync_user_email
                with SessionLocal() as db:
                    sync_user_email(db, user_id, user_email)
            except Exception as sync_err:
                print(f"[Auth User Sync Warning]: {sync_err}")

        return user_id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
