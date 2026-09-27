from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from typing import Optional
import os
import base64
from urllib.parse import quote
from app.database import get_db
from app.models import User, DataSources, SourceType
import httpx
from celery.result import AsyncResult
import jwt
from google.oauth2 import id_token
from datetime import datetime, timedelta
from app.tasks import celery_app, sync_gmail_messages, sync_drive_messages

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


workspace_mimes = {
    "application/vnd.google-apps.document": "application/pdf",
    "application/vnd.google-apps.spreadsheet": "application/pdf",
    "application/vnd.google-apps.presentation": "application/pdf",
    "application/vnd.google-apps.drawing": "application/pdf",
}

workspace_extensions = {
    "application/vnd.google-apps.document": "pdf",
    "application/vnd.google-apps.spreadsheet": "pdf",
    "application/vnd.google-apps.presentation": "pdf",
    "application/vnd.google-apps.drawing": "pdf",
}

mime_extensions = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/msword": "doc",
    "application/vnd.ms-excel": "xls",
    "application/vnd.ms-powerpoint": "ppt",
    "text/plain": "txt",
    "text/csv": "csv",
    "text/html": "html",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/zip": "zip",
    "application/json": "json",
}

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

async def get_file_info(file_id : str,google_access_token: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            url=f"https://www.googleapis.com/drive/v3/files/{file_id}",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={"fields": "id,name,mimeType,size,modifiedTime,webViewLink"}
        )
        return response



def decode_payload_data(part: dict):
    if not isinstance(part, dict):
        return
    body = part.get("body")
    if isinstance(body, dict) and "data" in body and isinstance(body["data"], str):
        try:
            raw_data = body["data"]
            padded_data = raw_data + "=" * (-len(raw_data) % 4)
            decoded_bytes = base64.urlsafe_b64decode(padded_data)
            body["data"] = decoded_bytes.decode("utf-8", errors="replace")
        except Exception:
            pass

    for sub_part in part.get("parts", []):
        decode_payload_data(sub_part)

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


@router.get("/download/google/drive/files/{file_id}")
async def download_file(file_id : str,current_user : User = Depends(get_current_user),db : Session = Depends(get_db)):

    google_access_token = await get_google_access_token(
            refresh_token=current_user.google_refresh_token,
            db=db,
            user=current_user,
    )

    file = db.query(DataSources).filter(DataSources.unique_id == file_id).first()

    if file :
        raise HTTPException(status_code=409,detail="The File already exist in the database")

    file_response = await get_file_info(file_id,google_access_token)

    if file_response.status_code == 401:
        current_user.google_refresh_token = None
        db.commit()
        raise HTTPException(status_code=401, detail="Google access revoked. Please log in again.")

    mimeType = file_response.json().get("mimeType", "")
    is_workspace = mimeType.startswith("application/vnd.google-apps") if mimeType else False

    async with httpx.AsyncClient() as client:
        if is_workspace:
            url = f"https://www.googleapis.com/drive/v3/files/{file_id}/export"
            params = {"mimeType": workspace_mimes.get(mimeType, "application/pdf")}
            ext = workspace_extensions.get(mimeType, "pdf")
            filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.{ext}"
        else:
            url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
            params = {"alt" : "media"}
            ext = mime_extensions.get(mimeType, "pdf")
            filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.{ext}"
        async with client.stream(
            "GET",
            url=url,
            params=params,
            headers={"Authorization": f"Bearer {google_access_token}"}

        ) as response:
            response.raise_for_status()
            with open(filename, "wb") as f:
                async for chunk in response.aiter_bytes(65536):
                    f.write(chunk)

    return {
        "message" : "successfull"
    }



@router.get("/google/drive/search")
async def search_drive_files(
    q: str,
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


@router.get("/google/gmail/list")
async def get_all_gmail_messages(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    google_access_token = await get_google_access_token(
        str(current_user.google_refresh_token), db, current_user
    )

    async with httpx.AsyncClient() as client:
        gmail_response = await client.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={"maxResults": 50},
        )

    if gmail_response.status_code == 401:
        current_user.google_refresh_token = None
        db.commit()
        raise HTTPException(
            status_code=401,
            detail="Google access revoked. Please log in again.",
        )

    if gmail_response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Gmail API error: {gmail_response.text}",
        )

    return gmail_response.json()




@router.get("/gmail/messages/{message_id}")
async def download_gmail_message(message_id : str,current_user : User = Depends(get_current_user),db : Session = Depends(get_db)):
    google_access_token = await get_google_access_token(
            str(current_user.google_refresh_token), db, current_user
    )

    async with httpx.AsyncClient() as client:
        gmail_response = await client.get(
            f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={"format" : "full"}
        )
        

    if gmail_response.status_code == 401:
        current_user.google_refresh_token = None
        db.commit()
        raise HTTPException(
            status_code=401,
            detail="Google access revoked. Please log in again.",
        )

    if gmail_response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Gmail API error: {gmail_response.text}",
        )
    message_data = gmail_response.json()



    payload = message_data.get("payload")
    if isinstance(payload, dict):
        decode_payload_data(payload)

    return message_data


@router.post("/sync-message")
def sync_messages( source: Optional[SourceType] = Query(None, description="Source to sync messages from"),current_user : User = Depends(get_current_user),db : Session = Depends(get_db)):
    if source == SourceType.gdrive:
        task = sync_drive_messages.delay(user_id=current_user.id)
        return {
            "message" : f"gdrive messages added in the task with {task.id}"
        }
    elif source == SourceType.gmail:
        task = sync_gmail_messages.delay(user_id=current_user.id)
        return {
            "message" : f"gmail messages added in the task with {task.id}"
        }
    else:
        task1 = sync_gmail_messages.delay(user_id=current_user.id)
        task2 = sync_drive_messages.delay(user_id=current_user.id)
        return {
            "message" : f"gmail messages and gdrive added in the task with {task1.id} and {task2.id} respectively"
        }


@router.get("/task/status/{task_id}")
def get_task_id(task_id : str,current_user : User = Depends(get_current_user),db : Session = Depends(get_db)):
    task_result = AsyncResult(task_id, app=celery_app)
    
    result = None
    if task_result.ready():
        result = str(task_result.result) if task_result.failed() else task_result.result

    return {
        "task_id": task_id,
        "status": task_result.status,  
        "result": result
    }



# clicked on sync button - > background me saare messages aur drive ki files sync ho jani chahiye 
#celery -> 
    # first to ye hai ki messages ko save in the database and convert each in vector and store it 
