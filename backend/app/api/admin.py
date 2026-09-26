from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from typing import Optional
import os
from urllib.parse import quote
from app.database import get_db
from app.models import User
import httpx
import jwt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from datetime import datetime, timedelta

load_dotenv(override=True)

router = APIRouter(tags=["admin"])

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
        if user_exist.google_refresh_token:
            our_token = create_access_token(user_exist.id)
            return RedirectResponse(url=f"{frontend_url}/auth/callback?access_token={our_token}")
    

        if not refresh_token:
            return RedirectResponse(url=f"{BACKEND_URL}/google/login?prompt=consent&email={quote(email)}")
            

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


# -------------------------------------------------------------------
# Google Drive: list files
# -------------------------------------------------------------------
@router.get("/google/drive/files")
async def get_drive_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page_size: int = 20,
):
    google_access_token = await get_google_access_token(
        refresh_token=current_user.google_refresh_token,
        db=db,
        user=current_user,
    )

    async with httpx.AsyncClient() as client:
        drive_resp = await client.get(
            "https://www.googleapis.com/drive/v3/files",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={
                "pageSize": page_size,
                "fields": "files(id,name,mimeType,size,modifiedTime)",
                "orderBy": "modifiedTime desc",
            },
        )

    if drive_resp.status_code == 401:
        # Access token rejected → RT likely dead
        current_user.google_refresh_token = None
        db.commit()
        raise HTTPException(status_code=401, detail="Google access revoked. Please log in again.")

    if drive_resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Drive API error: {drive_resp.text}")

    return drive_resp.json()



@router.get("/google/drive/files/{file_id}")
async def get_drive_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    google_access_token = await get_google_access_token(
        refresh_token=current_user.google_refresh_token,
        db=db,
        user=current_user,
    )

    async with httpx.AsyncClient() as client:
        drive_resp = await client.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={"fields": "id,name,mimeType,size,modifiedTime,webViewLink"},
        )

    if drive_resp.status_code == 401:
        current_user.google_refresh_token = None
        db.commit()
        raise HTTPException(status_code=401, detail="Google access revoked. Please log in again.")

    if drive_resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Drive API error: {drive_resp.text}")

    return drive_resp.json()


@router.get("/google/drive/search")
async def search_drive_files(
    q: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page_size: int = 20,
):
    """
    Example: q=name contains 'report'
    See: https://developers.google.com/drive/api/guides/search-files
    """
    google_access_token = await get_google_access_token(
        refresh_token=current_user.google_refresh_token,
        db=db,
        user=current_user,
    )

    async with httpx.AsyncClient() as client:
        drive_resp = await client.get(
            "https://www.googleapis.com/drive/v3/files",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={
                "q": q,
                "pageSize": page_size,
                "fields": "files(id,name,mimeType,size,modifiedTime)",
            },
        )

    if drive_resp.status_code == 401:
        current_user.google_refresh_token = None
        db.commit()
        raise HTTPException(status_code=401, detail="Google access revoked. Please log in again.")

    if drive_resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Drive API error: {drive_resp.text}")

    return drive_resp.json()
