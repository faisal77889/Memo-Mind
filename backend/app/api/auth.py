from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from google.auth.transport import requests as google_requests
from dotenv import load_dotenv
from typing import Optional
import os
from urllib.parse import quote
from app.database import get_db
from app.models import User
import httpx
import jwt
from google.oauth2 import id_token
from datetime import datetime, timedelta

load_dotenv(override=True)

router = APIRouter(tags=["auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("REDIRECT_URL")
GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
GOOGLE_GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

BACKEND_URL = "http://localhost:8000"

bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(days=7),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, os.getenv("JWT_SECRET"), algorithm="HS256")

def verify_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            os.getenv("JWT_SECRET"),
            algorithms=["HS256"],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = verify_token(credentials.credentials)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_google_access_token(refresh_token: str, db: Session, user: User) -> str:
    """Exchange a Google refresh token for a fresh access token."""
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No Google refresh token. Please re-login.")

    data = {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(GOOGLE_TOKEN_URL, data=data)

    if response.status_code != 200:
        # Refresh token is dead → clear it from DB and ask user to re-login
        error_body = response.text
        if "invalid_grant" in error_body:
            user.google_refresh_token = None
            db.commit()
            raise HTTPException(
                status_code=401,
                detail="Google access revoked. Please log in again.",
            )
        raise HTTPException(status_code=502, detail=f"Refresh failed: {error_body}")

    token_data = response.json()
    google_access_token = token_data.get("access_token")
    if not google_access_token:
        raise HTTPException(status_code=502, detail="No access token in Google response")

    return google_access_token


@router.get("/google/login")
async def get_auth_url(
    prompt: Optional[str] = None,
    email: Optional[str] = None,
    db: Session = Depends(get_db),
):
    scopes = f"openid profile email {GOOGLE_DRIVE_SCOPE} {GOOGLE_GMAIL_SCOPE}"

    params = {
        "response_type": "code",
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "scope": scopes,
        "access_type": "offline",
        "prompt": "consent" if prompt else "select_account",
    }
    if email:
        params["login_hint"] = email
        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{query_string}")

    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    return {"url": f"{GOOGLE_AUTH_URL}?{query_string}"}


@router.get("/auth/google")
async def auth_google(code: str, db: Session = Depends(get_db)):
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(GOOGLE_TOKEN_URL, data=data)
        response.raise_for_status()
        token_data = response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {e.response.text}")

    refresh_token = token_data.get("refresh_token")
    print("refresh token",refresh_token)
    google_id_token = token_data.get("id_token")

    try:
        user_info = id_token.verify_oauth2_token(
            google_id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid ID token: {e}")

    email = user_info.get("email")
    full_name = user_info.get("name")
    picture = user_info.get("picture")
    google_sub = user_info.get("sub")

    user_exist = db.query(User).filter(User.email == email).first()

    if user_exist:
        print("inside the user_exist if")
        if user_exist.google_refresh_token:
            our_token = create_access_token(user_exist.id)
            return RedirectResponse(url=f"{frontend_url}/auth/callback?access_token={our_token}")
        print("passed the user exist")

        if not refresh_token:
            print("refresh token is no there ")
            return RedirectResponse(url=f"{BACKEND_URL}/google/login?prompt=consent&email={quote(email)}")
            
        print("passed the not refresh token")
        user_exist.google_refresh_token = refresh_token
        db.commit()
        our_token = create_access_token(user_exist.id)
        return RedirectResponse(url=f"{frontend_url}/auth/callback?access_token={our_token}")


    if not refresh_token:
        return RedirectResponse(url=f"{BACKEND_URL}/google/login?prompt=consent&email={quote(email)}")
        

    new_user = User(
        email=email,
        name=full_name,
        picture=picture,
        google_sub=google_sub,
        google_refresh_token=refresh_token,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    our_token = create_access_token(new_user.id)
    return RedirectResponse(url=f"{frontend_url}/auth/callback?access_token={our_token}")
