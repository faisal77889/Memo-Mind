import os
import json
import base64
import logging
import httpx
from datetime import datetime
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv
from celery import Celery
from sqlalchemy.orm import Session

from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader

from bs4 import BeautifulSoup
from app.database import SessionMaker
from app.models import User, DataSources, SourceType, Status, DocumentPages

load_dotenv(override=True)

logger = logging.getLogger(__name__)

splitter = RecursiveCharacterTextSplitter(
    chunk_size=400,
    chunk_overlap=50
)

embedding = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
    output_dimensionality=768
)

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


def extract_file_chunks(file_path: str, ext: str) -> List[Dict[str, Any]]:
    """
    Extracts text chunks and page metadata from a downloaded file (PDF or text).
    Returns a list of dicts: [{"chunk": text, "meta_data": json_string}]
    """
    chunks_with_meta: List[Dict[str, Any]] = []

    if ext.lower() == "pdf":
        try:
            loader = PyPDFLoader(file_path)
            for page_doc in loader.lazy_load():
                page_chunks = splitter.split_documents([page_doc])
                page_num = page_doc.metadata.get("page", 0)
                for ch in page_chunks:
                    text = ch.page_content.strip()
                    if text:
                        chunks_with_meta.append({
                            "chunk": text,
                            "meta_data": json.dumps({"page": page_num})
                        })
        except Exception as e:
            logger.error(f"Error extracting PDF chunks from {file_path}: {e}")
            raise e
    else:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            if content.strip():
                text_chunks = splitter.split_text(content)
                for ch in text_chunks:
                    text = ch.strip()
                    if text:
                        chunks_with_meta.append({
                            "chunk": text,
                            "meta_data": json.dumps({"page": 1})
                        })
        except Exception as e:
            logger.warning(f"Failed to read file as text: {file_path}, error: {e}")

    return chunks_with_meta


def process_single_gdrive_file(
    file_id: str,
    google_access_token: str,
    db: Session,
    user_id: int,
    file_info: Optional[Dict[str, Any]] = None,
    client: Optional[httpx.Client] = None
) -> Dict[str, Any]:
    """
    Downloads a single file from Google Drive, extracts chunks and embeddings in batch,
    saves DocumentPages in batch, updates DataSources status, and deletes the local file.
    """
    should_close_client = False
    if client is None:
        client = httpx.Client(timeout=60.0)
        should_close_client = True

    local_filename: Optional[str] = None
    data_source: Optional[DataSources] = None

    try:
        if not file_info or "mimeType" not in file_info or "name" not in file_info:
            meta_resp = client.get(
                f"https://www.googleapis.com/drive/v3/files/{file_id}",
                headers={"Authorization": f"Bearer {google_access_token}"},
                params={"fields": "id,name,mimeType,size,modifiedTime,trashed"}
            )
            if meta_resp.status_code != 200:
                raise Exception(
                    f"Failed to fetch file metadata for {file_id}: status {meta_resp.status_code} - {meta_resp.text}"
                )
            file_info = meta_resp.json()

        if file_info.get("trashed"):
            existing = db.query(DataSources).filter(DataSources.unique_id == file_id).first()
            if existing:
                db.delete(existing)
                db.commit()
            return {"status": "removed", "file_id": file_id}

        mime_type = file_info.get("mimeType", "")
        name = file_info.get("name", file_id)

        # Skip folders
        if mime_type == "application/vnd.google-apps.folder":
            return {"status": "skipped", "reason": "folder", "file_id": file_id}

        is_workspace = mime_type.startswith("application/vnd.google-apps") if mime_type else False
        if is_workspace:
            if mime_type not in workspace_mimes:
                logger.warning(f"Unsupported Google Workspace mimeType {mime_type} for file {file_id}, skipping")
                return {"status": "skipped", "reason": f"unsupported workspace mimeType {mime_type}", "file_id": file_id}
            url = f"https://www.googleapis.com/drive/v3/files/{file_id}/export"
            params = {"mimeType": workspace_mimes.get(mime_type, "application/pdf")}
            ext = workspace_extensions.get(mime_type, "pdf")
        else:
            url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
            params = {"alt": "media"}
            ext = mime_extensions.get(mime_type, "pdf")

        # Create or update DataSources record with Status.pending
        existing = db.query(DataSources).filter(DataSources.unique_id == file_id).first()
        if existing:
            data_source = existing
            data_source.name = name
            data_source.mimeType = mime_type
            data_source.status = Status.pending
            db.commit()
            # Clean up old document pages for re-indexing
            db.query(DocumentPages).filter(DocumentPages.data_source_id == data_source.id).delete()
            db.commit()
        else:
            data_source = DataSources(
                name=name,
                mimeType=mime_type,
                type=SourceType.gdrive,
                unique_id=file_id,
                content=name,
                user_id=user_id,
                status=Status.pending
            )
            db.add(data_source)
            db.commit()
            db.refresh(data_source)

        # 1. Download file to local disk
        timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
        local_filename = f"temp_gdrive_{file_id}_{timestamp_str}.{ext}"

        with client.stream("GET", url=url, params=params, headers={"Authorization": f"Bearer {google_access_token}"}) as response:
            if response.status_code != 200:
                raise Exception(f"Download failed for file {file_id}: HTTP {response.status_code} - {response.text}")
            with open(local_filename, "wb") as f:
                for chunk in response.iter_bytes(65536):
                    f.write(chunk)

        # 2. Extract content chunks
        chunks_data = extract_file_chunks(local_filename, ext)

        # 3. Batch generate embeddings and batch save DocumentPages
        if chunks_data:
            texts_to_embed = [c["chunk"] for c in chunks_data]
            batch_size = 50
            all_embeddings = []
            for i in range(0, len(texts_to_embed), batch_size):
                batch_slice = texts_to_embed[i:i + batch_size]
                batch_embeddings = embedding.embed_documents(batch_slice)
                all_embeddings.extend(batch_embeddings)

            document_pages = [
                DocumentPages(
                    meta_data=c["meta_data"],
                    data_source_id=data_source.id,
                    chunk=c["chunk"],
                    embedding=emb
                )
                for c, emb in zip(chunks_data, all_embeddings)
            ]
            db.add_all(document_pages)

        # 4. Save completed status in database
        data_source.status = Status.completed
        data_source.content = name
        db.commit()

        return {
            "status": "success",
            "file_id": file_id,
            "chunks_count": len(chunks_data)
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error processing Google Drive file {file_id}: {str(e)}", exc_info=True)
        if data_source:
            data_source.status = Status.failed
            db.commit()
        raise e

    finally:
        # Delete local file when done
        if local_filename and os.path.exists(local_filename):
            try:
                os.remove(local_filename)
            except Exception as rm_err:
                logger.warning(f"Failed to delete local temp file {local_filename}: {rm_err}")

        if should_close_client:
            client.close()
            


def extract_email_body(part: dict) -> str:
    """
    Recursively extracts the best text content (preferring text/plain over text/html)
    from a decoded Gmail message payload.
    """
    if not isinstance(part, dict):
        return ""

    mime_type = part.get("mimeType", "")
    body_data = part.get("body", {}).get("data")

    # If this part directly contains text/plain
    if mime_type == "text/plain" and isinstance(body_data, str) and body_data.strip():
        return body_data.strip()

    # If this part directly contains text/html
    if mime_type == "text/html" and isinstance(body_data, str) and body_data.strip():
        soup = BeautifulSoup(body_data, "html.parser")
        return soup.get_text(separator="\n", strip=True)

    # If multipart, search subparts
    plain_texts = []
    html_texts = []

    for sub in part.get("parts", []):
        sub_mime = sub.get("mimeType", "")
        if sub_mime == "text/plain":
            txt = extract_email_body(sub)
            if txt:
                plain_texts.append(txt)
        elif sub_mime == "text/html":
            txt = extract_email_body(sub)
            if txt:
                html_texts.append(txt)
        elif sub.get("parts"):
            txt = extract_email_body(sub)
            if txt:
                plain_texts.append(txt)

    if plain_texts:
        return "\n\n".join(plain_texts)
    if html_texts:
        return "\n\n".join(html_texts)

    if isinstance(body_data, str) and body_data.strip():
        return body_data.strip()

    return ""


def process_single_gmail_message(
    msg_id: str,
    google_access_token: str,
    db: Session,
    user_id: int,
    client: Optional[httpx.Client] = None
) -> Dict[str, Any]:
    """
    Fetches full Gmail message, extracts headers and body, batches embeddings,
    saves DocumentPages, and updates DataSources status.
    """
    should_close_client = False
    if client is None:
        client = httpx.Client(timeout=60.0)
        should_close_client = True

    data_source: Optional[DataSources] = None

    try:
        gmail_response = client.get(
            f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={"format": "full"}
        )
        if gmail_response.status_code != 200:
            raise Exception(f"Failed to fetch Gmail message {msg_id}: HTTP {gmail_response.status_code} - {gmail_response.text}")

        message_data = gmail_response.json()
        payload = message_data.get("payload")
        if isinstance(payload, dict):
            decode_payload_data(payload)

        headers = payload.get("headers", []) if isinstance(payload, dict) else []
        header_map = {h.get("name", "").lower(): h.get("value", "") for h in headers if isinstance(h, dict)}
        subject = header_map.get("subject") or message_data.get("snippet") or msg_id
        sender = header_map.get("from", "")
        receiver = header_map.get("to", "")
        date_str = header_map.get("date", "")
        thread_id = message_data.get("threadId")
        mime_type = payload.get("mimeType", "text/plain") if isinstance(payload, dict) else "text/plain"

        # Create or update DataSources record with Status.pending
        existing = db.query(DataSources).filter(DataSources.unique_id == msg_id).first()
        if existing:
            data_source = existing
            data_source.name = subject
            data_source.mimeType = mime_type
            data_source.thread_id = thread_id
            data_source.status = Status.pending
            db.commit()
            # Clean up old document pages before re-indexing
            db.query(DocumentPages).filter(DocumentPages.data_source_id == data_source.id).delete()
            db.commit()
        else:
            data_source = DataSources(
                name=subject,
                mimeType=mime_type,
                type=SourceType.gmail,
                unique_id=msg_id,
                thread_id=thread_id,
                content=json.dumps(message_data),
                user_id=user_id,
                status=Status.pending
            )
            db.add(data_source)
            db.commit()
            db.refresh(data_source)

        # Extract content & generate chunks
        raw_content = extract_email_body(payload) if isinstance(payload, dict) else ""
        if not raw_content.strip():
            raw_content = message_data.get("snippet", "")

        chunks_text = splitter.split_text(raw_content) if raw_content.strip() else []
        if not chunks_text and raw_content.strip():
            chunks_text = [raw_content.strip()]

        email_header_prefix = f"Subject: {subject}\nFrom: {sender}\nTo: {receiver}\nDate: {date_str}\n\n"
        metadata_json = json.dumps({
            "subject": subject,
            "from": sender,
            "to": receiver,
            "date": date_str,
            "threadId": thread_id
        })

        chunks_data = [
            {
                "chunk": f"{email_header_prefix}{text}",
                "meta_data": metadata_json
            }
            for text in chunks_text if text.strip()
        ]

        # Batch generate embeddings in one go and batch save DocumentPages
        if chunks_data:
            texts_to_embed = [c["chunk"] for c in chunks_data]
            batch_size = 50
            all_embeddings = []
            for i in range(0, len(texts_to_embed), batch_size):
                batch_slice = texts_to_embed[i:i + batch_size]
                batch_embeddings = embedding.embed_documents(batch_slice)
                all_embeddings.extend(batch_embeddings)

            document_pages = [
                DocumentPages(
                    meta_data=c["meta_data"],
                    data_source_id=data_source.id,
                    chunk=c["chunk"],
                    embedding=emb
                )
                for c, emb in zip(chunks_data, all_embeddings)
            ]
            db.add_all(document_pages)

        # Save completed status
        data_source.status = Status.completed
        data_source.content = json.dumps(message_data)
        db.commit()

        return {
            "status": "success",
            "message_id": msg_id,
            "chunks_count": len(chunks_data)
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error processing Gmail message {msg_id}: {str(e)}", exc_info=True)
        if data_source:
            data_source.status = Status.failed
            db.commit()
        raise e

    finally:
        if should_close_client:
            client.close()


@celery_app.task(name="tasks.sync-gmail-messages")
def sync_gmail_messages(user_id: int, message_ids: Optional[List[str]] = None):
    db = SessionMaker()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"status": "error", "detail": "User not found"}

        try:
            google_access_token = get_google_access_token(
                str(user.google_refresh_token), db, user
            )
        except Exception as token_err:
            logger.error(f"Failed to obtain Google access token for user {user_id}: {token_err}")
            return {"status": "error", "detail": f"Authentication failed: {str(token_err)}"}

        synced_count = 0
        errors: List[str] = []

        with httpx.Client(timeout=60.0) as client:
            target_message_ids: List[str] = []

            # If specific message_ids passed, prioritize them
            if message_ids:
                target_message_ids = list(set(message_ids))
            else:
                # 1. Check gmailHistoryId
                if user.gmailHistoryId is None:
                    # Initial sync: Fetch current historyId from user profile
                    profile_resp = client.get(
                        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
                        headers={"Authorization": f"Bearer {google_access_token}"}
                    )
                    if profile_resp.status_code != 200:
                        err_msg = f"Failed to get Gmail profile: HTTP {profile_resp.status_code} - {profile_resp.text}"
                        logger.error(err_msg)
                        return {"status": "error", "detail": err_msg}

                    profile_data = profile_resp.json()
                    current_history_id = profile_data.get("historyId")
                    if current_history_id:
                        user.gmailHistoryId = str(current_history_id)
                        db.commit()

                    # Initial list of messages
                    list_resp = client.get(
                        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                        headers={"Authorization": f"Bearer {google_access_token}"},
                        params={"maxResults": 50}
                    )
                    if list_resp.status_code != 200:
                        err_msg = f"Failed to list Gmail messages: HTTP {list_resp.status_code} - {list_resp.text}"
                        logger.error(err_msg)
                        return {"status": "error", "detail": err_msg}

                    target_message_ids = [m["id"] for m in list_resp.json().get("messages", []) if "id" in m]

                else:
                    # Incremental sync using History API
                    history_resp = client.get(
                        "https://gmail.googleapis.com/gmail/v1/users/me/history",
                        headers={"Authorization": f"Bearer {google_access_token}"},
                        params={
                            "startHistoryId": str(user.gmailHistoryId),
                            "maxResults": 100
                        }
                    )

                    # Handle expired historyId (HTTP 404)
                    if history_resp.status_code == 404:
                        logger.warning(f"Saved gmailHistoryId {user.gmailHistoryId} expired. Resetting historyId...")
                        profile_resp = client.get(
                            "https://gmail.googleapis.com/gmail/v1/users/me/profile",
                            headers={"Authorization": f"Bearer {google_access_token}"}
                        )
                        if profile_resp.status_code == 200:
                            new_h_id = profile_resp.json().get("historyId")
                            if new_h_id:
                                user.gmailHistoryId = str(new_h_id)
                                db.commit()

                        list_resp = client.get(
                            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                            headers={"Authorization": f"Bearer {google_access_token}"},
                            params={"maxResults": 50}
                        )
                        if list_resp.status_code == 200:
                            target_message_ids = [m["id"] for m in list_resp.json().get("messages", []) if "id" in m]
                    elif history_resp.status_code != 200:
                        err_msg = f"Failed to fetch Gmail history: HTTP {history_resp.status_code} - {history_resp.text}"
                        logger.error(err_msg)
                        return {"status": "error", "detail": err_msg}
                    else:
                        history_data = history_resp.json()
                        history_records = history_data.get("history", [])

                        messages_to_add: set = set()
                        messages_to_del: set = set()

                        for record in history_records:
                            for item in record.get("messagesAdded", []):
                                m = item.get("message") or {}
                                if m.get("id"):
                                    messages_to_add.add(m.get("id"))
                            for item in record.get("messagesDeleted", []):
                                m = item.get("message") or {}
                                if m.get("id"):
                                    messages_to_del.add(m.get("id"))

                        # Delete removed messages from database
                        for del_id in messages_to_del:
                            existing = db.query(DataSources).filter(DataSources.unique_id == del_id).first()
                            if existing:
                                db.delete(existing)
                                db.commit()
                                logger.info(f"Removed datasource for deleted Gmail message: {del_id}")

                        target_message_ids = list(messages_to_add - messages_to_del)

                        # Update gmailHistoryId
                        latest_history_id = history_data.get("historyId")
                        if latest_history_id:
                            user.gmailHistoryId = str(latest_history_id)
                            db.commit()

            # Process all target messages
            for msg_id in target_message_ids:
                try:
                    res = process_single_gmail_message(
                        msg_id=msg_id,
                        google_access_token=google_access_token,
                        db=db,
                        user_id=user_id,
                        client=client
                    )
                    if res.get("status") == "success":
                        synced_count += 1
                except Exception as msg_err:
                    err_detail = f"Error processing message {msg_id}: {str(msg_err)}"
                    logger.error(err_detail)
                    errors.append(err_detail)

            return {
                "status": "success",
                "synced_count": synced_count,
                "errors": errors if errors else None
            }

    except Exception as e:
        logger.error(f"Unexpected error in sync_gmail_messages: {str(e)}", exc_info=True)
        return {"status": "error", "detail": str(e)}
    finally:
        db.close()


@celery_app.task(name="tasks.sync-drive-messages")
def sync_drive_messages(user_id: int):
    db = SessionMaker()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"status": "error", "detail": "User not found"}

        try:
            google_access_token = get_google_access_token(
                str(user.google_refresh_token), db, user
            )
        except Exception as token_err:
            logger.error(f"Failed to obtain Google access token for user {user_id}: {token_err}")
            return {"status": "error", "detail": f"Authentication failed: {str(token_err)}"}

        items_to_process: List[Dict[str, Any]] = []

        with httpx.Client(timeout=60.0) as client:
            # 1. Check startPageToken
            if user.gdrive_page_token is None:
                # Initial sync: Fetch startPageToken for future incremental changes
                page_token_resp = client.get(
                    "https://www.googleapis.com/drive/v3/changes/startPageToken",
                    headers={"Authorization": f"Bearer {google_access_token}"}
                )
                if page_token_resp.status_code != 200:
                    err_msg = f"Failed to get startPageToken from Google Drive: HTTP {page_token_resp.status_code} - {page_token_resp.text}"
                    logger.error(err_msg)
                    return {"status": "error", "detail": err_msg}

                start_page_token = page_token_resp.json().get("startPageToken")
                if not start_page_token:
                    return {"status": "error", "detail": "No startPageToken returned from Google Drive"}

                try:
                    user.gdrive_page_token = int(start_page_token)
                    db.commit()
                except (ValueError, TypeError) as conv_err:
                    logger.warning(f"Failed to convert startPageToken '{start_page_token}' to integer: {conv_err}")

                # Initial file list
                files_resp = client.get(
                    "https://www.googleapis.com/drive/v3/files",
                    headers={"Authorization": f"Bearer {google_access_token}"},
                    params={
                        "pageSize": 50,
                        "fields": "nextPageToken, files(id, name, mimeType, trashed)",
                        "q": "trashed = false and mimeType != 'application/vnd.google-apps.folder'"
                    }
                )
                if files_resp.status_code != 200:
                    err_msg = f"Failed to list Drive files: HTTP {files_resp.status_code} - {files_resp.text}"
                    logger.error(err_msg)
                    return {"status": "error", "detail": err_msg}

                items_to_process = files_resp.json().get("files", [])

            else:
                # Incremental sync using changes API
                page_token = str(user.gdrive_page_token)
                changes_resp = client.get(
                    "https://www.googleapis.com/drive/v3/changes",
                    headers={"Authorization": f"Bearer {google_access_token}"},
                    params={
                        "pageToken": page_token,
                        "fields": "nextPageToken, newStartPageToken, changes(changeType, file(id, name, mimeType, trashed), removed, fileId)"
                    }
                )

                # Handle expired / invalid token
                if changes_resp.status_code in (400, 404, 410):
                    logger.warning(f"Saved startPageToken {page_token} expired or invalid. Resetting token...")
                    token_resp = client.get(
                        "https://www.googleapis.com/drive/v3/changes/startPageToken",
                        headers={"Authorization": f"Bearer {google_access_token}"}
                    )
                    if token_resp.status_code == 200:
                        fresh_token = token_resp.json().get("startPageToken")
                        if fresh_token:
                            try:
                                user.gdrive_page_token = int(fresh_token)
                                db.commit()
                            except (ValueError, TypeError):
                                pass

                    files_resp = client.get(
                        "https://www.googleapis.com/drive/v3/files",
                        headers={"Authorization": f"Bearer {google_access_token}"},
                        params={
                            "pageSize": 50,
                            "fields": "nextPageToken, files(id, name, mimeType, trashed)",
                            "q": "trashed = false and mimeType != 'application/vnd.google-apps.folder'"
                        }
                    )
                    if files_resp.status_code == 200:
                        items_to_process = files_resp.json().get("files", [])
                elif changes_resp.status_code != 200:
                    err_msg = f"Failed to fetch changes from Google Drive: HTTP {changes_resp.status_code} - {changes_resp.text}"
                    logger.error(err_msg)
                    return {"status": "error", "detail": err_msg}
                else:
                    changes_data = changes_resp.json()
                    items_to_process = changes_data.get("changes", [])
                    new_token = changes_data.get("newStartPageToken")
                    if new_token:
                        try:
                            user.gdrive_page_token = int(new_token)
                            db.commit()
                        except (ValueError, TypeError):
                            pass

            synced_count = 0
            errors: List[str] = []

            for item in items_to_process:
                file_obj = item.get("file") if isinstance(item.get("file"), dict) else {}
                file_id = item.get("fileId") or file_obj.get("id") or item.get("id")

                if not file_id:
                    continue

                is_removed = item.get("removed", False) or file_obj.get("trashed", False)
                if is_removed:
                    existing = db.query(DataSources).filter(DataSources.unique_id == file_id).first()
                    if existing:
                        db.delete(existing)
                        db.commit()
                        logger.info(f"Removed datasource for deleted Google Drive file: {file_id}")
                    continue

                try:
                    res = process_single_gdrive_file(
                        file_id=file_id,
                        google_access_token=google_access_token,
                        db=db,
                        user_id=user_id,
                        file_info=file_obj if file_obj.get("name") else None,
                        client=client
                    )
                    if res.get("status") == "success":
                        synced_count += 1
                except Exception as file_err:
                    err_detail = f"Error processing file {file_id}: {str(file_err)}"
                    logger.error(err_detail)
                    errors.append(err_detail)

            return {
                "status": "success",
                "synced_count": synced_count,
                "errors": errors if errors else None
            }

    except Exception as e:
        logger.error(f"Unexpected error in sync_drive_messages: {str(e)}", exc_info=True)
        return {"status": "error", "detail": str(e)}
    finally:
        db.close()
