import os
import json
import base64
import httpx
from datetime import datetime
from typing import List, Optional
from dotenv import load_dotenv
from celery import Celery

from app.database import SessionMaker
from app.models import User, DataSources, SourceType

load_dotenv(override=True)

celery_app = Celery(
    "worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

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


def get_google_access_token(refresh_token: str, db, user: User) -> str:
    """Exchange a Google refresh token for a fresh access token."""
    if not refresh_token:
        raise Exception("No Google refresh token. Please re-login.")

    data = {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }

    with httpx.Client() as client:
        response = client.post(GOOGLE_TOKEN_URL, data=data)

    if response.status_code != 200:
        error_body = response.text
        if "invalid_grant" in error_body:
            user.google_refresh_token = None
            db.commit()
            raise Exception("Google access revoked. Please log in again.")
        raise Exception(f"Refresh failed: {error_body}")

    token_data = response.json()
    google_access_token = token_data.get("access_token")
    if not google_access_token:
        raise Exception("No access token in Google response")

    return google_access_token


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


@celery_app.task(name="tasks.sync-gmail-messages")
def sync_gmail_messages(user_id: int, message_ids: Optional[List[str]] = None):
    db = SessionMaker()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"status": "error", "detail": "User not found"}

        google_access_token = get_google_access_token(
            str(user.google_refresh_token), db, user
        )

        with httpx.Client() as client:
            if not message_ids:
                list_resp = client.get(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                    headers={"Authorization": f"Bearer {google_access_token}"},
                    params={"maxResults": 50},
                )
                if list_resp.status_code == 200:
                    message_ids = [m["id"] for m in list_resp.json().get("messages", [])]
                else:
                    return {"status": "error", "detail": f"Failed to list messages: {list_resp.text}"}

            saved_count = 0
            for msg_id in (message_ids or []):
                gmail_response = client.get(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}",
                    headers={"Authorization": f"Bearer {google_access_token}"},
                    params={"format": "full"}
                )
                if gmail_response.status_code != 200:
                    continue

                message_data = gmail_response.json()
                payload = message_data.get("payload")
                if isinstance(payload, dict):
                    decode_payload_data(payload)

                subject = None
                headers = payload.get("headers", []) if isinstance(payload, dict) else []
                for h in headers:
                    if h.get("name", "").lower() == "subject":
                        subject = h.get("value")
                        break

                mime_type = payload.get("mimeType", "text/plain") if isinstance(payload, dict) else "text/plain"

                existing = db.query(DataSources).filter(DataSources.unique_id == msg_id).first()
                if not existing:
                    data_source = DataSources(
                        name=subject or message_data.get("snippet") or msg_id,
                        mimeType=mime_type,
                        type=SourceType.gmail,
                        unique_id=msg_id,
                        content=json.dumps(message_data),
                        user_id=user_id
                    )
                    db.add(data_source)
                    saved_count += 1

            db.commit()
            return {"status": "success", "synced_count": saved_count}
    finally:
        db.close()


@celery_app.task(name="tasks.sync-drive-messages")
def sync_drive_messages(user_id: int, message_ids: Optional[List[str]] = None):
    db = SessionMaker()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"status": "error", "detail": "User not found"}

        google_access_token = get_google_access_token(
            str(user.google_refresh_token), db, user
        )

        with httpx.Client() as client:
            if not message_ids:
                list_resp = client.get(
                    "https://www.googleapis.com/drive/v3/files",
                    headers={"Authorization": f"Bearer {google_access_token}"},
                    params={"pageSize": 20, "fields": "files(id,name,mimeType)"},
                )
                if list_resp.status_code == 200:
                    message_ids = [f["id"] for f in list_resp.json().get("files", [])]
                else:
                    return {"status": "error", "detail": f"Failed to list drive files: {list_resp.text}"}

            saved_count = 0
            for file_id in (message_ids or []):
                file_response = client.get(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}",
                    headers={"Authorization": f"Bearer {google_access_token}"},
                    params={"fields": "id,name,mimeType,size,modifiedTime,webViewLink"}
                )
                if file_response.status_code != 200:
                    continue

                file_info = file_response.json()
                mimeType = file_info.get("mimeType", "")
                name = file_info.get("name", file_id)
                is_workspace = mimeType.startswith("application/vnd.google-apps") if mimeType else False

                if is_workspace:
                    url = f"https://www.googleapis.com/drive/v3/files/{file_id}/export"
                    params = {"mimeType": workspace_mimes.get(mimeType, "application/pdf")}
                    ext = workspace_extensions.get(mimeType, "pdf")
                    filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.{ext}"
                else:
                    url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
                    params = {"alt": "media"}
                    ext = mime_extensions.get(mimeType, "pdf")
                    filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.{ext}"

                with client.stream(
                    "GET",
                    url=url,
                    params=params,
                    headers={"Authorization": f"Bearer {google_access_token}"}
                ) as response:
                    if response.status_code == 200:
                        with open(filename, "wb") as f:
                            for chunk in response.iter_bytes(65536):
                                f.write(chunk)

                existing = db.query(DataSources).filter(DataSources.unique_id == file_id).first()
                if not existing:
                    data_source = DataSources(
                        name=name,
                        mimeType=mimeType,
                        type=SourceType.gdrive,
                        unique_id=file_id,
                        content=filename,
                        user_id=user_id
                    )
                    db.add(data_source)
                    saved_count += 1

            db.commit()
            return {"status": "success", "synced_count": saved_count}
    finally:
        db.close()
