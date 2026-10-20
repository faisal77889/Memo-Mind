from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from typing import List, Optional, Dict, Any
import os
import base64
import json
import logging
import asyncio
import httpx
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.database import get_db
from app.models import User, DataSources, SourceType, Status, DocumentPages
from app.api.auth import get_current_user, get_google_access_token

load_dotenv(override=True)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["gmail"])

splitter = RecursiveCharacterTextSplitter(
    chunk_size=400,
    chunk_overlap=50
)

embedding = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    output_dimensionality=768
)

relevant_headers = ["From", "To", "Subject", "Date"]


def decode_payload_data(part: dict):
    """Recursively decodes URL-safe base64 encoded body data in place."""
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


def extract_content(parts: dict) -> Optional[str]:
    """Helper to extract text from a single MIME part."""
    if not isinstance(parts, dict):
        return None
    mime_type = parts.get("mimeType", "")
    body_data = parts.get("body", {}).get("data", "")
    if not body_data:
        return None

    if mime_type == "text/plain":
        return body_data
    if mime_type == "text/html":
        soup = BeautifulSoup(body_data, "html.parser")
        return soup.get_text(separator="\n", strip=True)
    return None


def findContent(payload: dict) -> dict:
    """
    Extracts headers and body content across various MIME multipart structures.
    Handles multipart/alternative, multipart/mixed, multipart/related, and plain/html.
    """
    if not isinstance(payload, dict):
        return {"metadata": {}, "raw_content": ""}

    headers_obj = {}
    for obj in payload.get("headers", []):
        name = obj.get("name")
        if name in relevant_headers:
            headers_obj[name] = obj.get("value", "")

    # Recursively collect text/plain and text/html parts
    text_plain_list = []
    text_html_list = []

    def collect_parts(part: dict):
        if not isinstance(part, dict):
            return
        m_type = part.get("mimeType", "")
        data = part.get("body", {}).get("data", "")
        if isinstance(data, str) and data.strip():
            if m_type == "text/plain":
                text_plain_list.append(data.strip())
            elif m_type == "text/html":
                text_html_list.append(data.strip())
        for sub_part in part.get("parts", []):
            collect_parts(sub_part)

    collect_parts(payload)

    if text_plain_list:
        data = "\n\n".join(text_plain_list)
    elif text_html_list:
        soup = BeautifulSoup("\n".join(text_html_list), "html.parser")
        data = soup.get_text(separator="\n", strip=True)
    else:
        data = ""

    return {
        "metadata": headers_obj,
        "raw_content": data
    }


def extract_email_data_for_embeddings(payload: dict) -> dict:
    """Extracts email headers and plain content for embedding generation."""
    parsed = findContent(payload)
    meta = parsed.get("metadata", {})
    raw_content = parsed.get("raw_content", "")

    chunk_to_embed = (
        f"Subject: {meta.get('Subject', '')}\n"
        f"From: {meta.get('From', '')}\n"
        f"Date: {meta.get('Date', '')}\n\n"
        f"{raw_content}"
    )

    return {
        "metadata": meta,
        "content_for_embedding": chunk_to_embed,
        "raw_text_length": len(raw_content),
    }


@router.get("/gmail/list")
async def get_all_gmail_messages(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    max_results: int = 25,
):
    """Fetches list of Gmail messages with rich metadata (subject, from, to, date, snippet)."""
    if not current_user.google_refresh_token:
        raise HTTPException(
            status_code=401,
            detail="Google account not connected or refresh token missing. Please sign in again."
        )

    google_access_token = await get_google_access_token(
        str(current_user.google_refresh_token), db, current_user
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        gmail_response = await client.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={"maxResults": max_results},
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

        list_data = gmail_response.json()
        raw_messages = list_data.get("messages", [])

        if not raw_messages:
            return {
                "messages": [],
                "nextPageToken": list_data.get("nextPageToken"),
                "resultSizeEstimate": 0
            }

        # Check which messages are already completed in DataSources
        msg_ids = [m["id"] for m in raw_messages if "id" in m]
        indexed_ids = set(
            row[0] for row in db.query(DataSources.unique_id)
            .filter(DataSources.unique_id.in_(msg_ids), DataSources.status == Status.completed)
            .all()
        )

        # Concurrently fetch format=metadata with concurrency limit
        sem = asyncio.Semaphore(12)

        async def fetch_meta(msg_item: dict) -> dict:
            m_id = msg_item.get("id")
            thread_id = msg_item.get("threadId", "")
            if not m_id:
                return msg_item

            async with sem:
                try:
                    resp = await client.get(
                        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{m_id}",
                        headers={"Authorization": f"Bearer {google_access_token}"},
                        params={
                            "format": "metadata",
                            "metadataHeaders": ["Subject", "From", "To", "Date"]
                        }
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        headers_list = data.get("payload", {}).get("headers", [])
                        headers_map = {
                            h.get("name", "").lower(): h.get("value", "")
                            for h in headers_list
                        }
                        return {
                            "id": m_id,
                            "threadId": thread_id or data.get("threadId", ""),
                            "subject": headers_map.get("subject") or f"Email #{m_id[:8]}",
                            "from": headers_map.get("from", ""),
                            "to": headers_map.get("to", ""),
                            "date": headers_map.get("date", ""),
                            "snippet": data.get("snippet", ""),
                            "is_indexed": m_id in indexed_ids
                        }
                except Exception as ex:
                    logger.warning(f"Failed to fetch metadata for message {m_id}: {ex}")

            return {
                "id": m_id,
                "threadId": thread_id,
                "subject": f"Email #{m_id[:8]}",
                "from": "",
                "to": "",
                "date": "",
                "snippet": "",
                "is_indexed": m_id in indexed_ids
            }

        rich_messages = await asyncio.gather(*(fetch_meta(m) for m in raw_messages))

        return {
            "messages": list(rich_messages),
            "nextPageToken": list_data.get("nextPageToken"),
            "resultSizeEstimate": list_data.get("resultSizeEstimate", len(rich_messages))
        }


@router.get("/gmail/messages/{message_id}")
async def download_gmail_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Downloads an individual Gmail message, decodes its payload, creates chunks,
    generates batch vector embeddings, and stores them into Synapse database.
    """
    if not current_user.google_refresh_token:
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Please log in again."
        )

    google_access_token = await get_google_access_token(
        str(current_user.google_refresh_token), db, current_user
    )

    # 1. Fetch message data from Google Gmail API
    async with httpx.AsyncClient(timeout=30.0) as client:
        gmail_response = await client.get(
            f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={"format": "full"}
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
            status_code=gmail_response.status_code,
            detail=f"Gmail API error: {gmail_response.text}",
        )

    message_data = gmail_response.json()
    thread_id = message_data.get("threadId", "")

    payload = message_data.get("payload", {})
    if isinstance(payload, dict):
        decode_payload_data(payload)

    gmail_json = findContent(payload)
    if not gmail_json:
        raise HTTPException(status_code=400, detail="Failed to extract content from email payload.")

    gmail_json["threadId"] = thread_id
    gmail_content = json.dumps(gmail_json)

    subject = gmail_json.get("metadata", {}).get("Subject") or f"Email #{message_id[:8]}"
    from_addr = gmail_json.get("metadata", {}).get("From", "")
    to_addr = gmail_json.get("metadata", {}).get("To", "")
    date_str = gmail_json.get("metadata", {}).get("Date", "")

    # 2. Check existing DataSources record to avoid UniqueViolation and allow re-indexing
    existing = db.query(DataSources).filter(DataSources.unique_id == message_id).first()
    if existing:
        if existing.status == Status.completed:
            raise HTTPException(
                status_code=409,
                detail=f"Email #{message_id[:8]} is already indexed in the database."
            )
        data_sources = existing
        data_sources.name = subject
        data_sources.mimeType = payload.get("mimeType", "message/rfc822")
        data_sources.thread_id = thread_id
        data_sources.content = gmail_content
        data_sources.status = Status.pending
        db.commit()
        # Clean up any partial document pages from prior failed attempt
        db.query(DocumentPages).filter(DocumentPages.data_source_id == data_sources.id).delete()
        db.commit()
    else:
        data_sources = DataSources(
            name=subject,
            mimeType=payload.get("mimeType", "message/rfc822"),
            type=SourceType.gmail,
            thread_id=thread_id,
            unique_id=message_id,
            content=gmail_content,
            status=Status.pending,
            user_id=current_user.id
        )
        db.add(data_sources)
        db.commit()
        db.refresh(data_sources)

    try:
        raw_text = gmail_json.get("raw_content") or ""
        if raw_text.strip():
            body_chunks = splitter.split_text(raw_text)
        else:
            body_chunks = [f"Subject: {subject}\nFrom: {from_addr}\nTo: {to_addr}\nDate: {date_str}"]

        if not body_chunks:
            body_chunks = [f"Subject: {subject}\nFrom: {from_addr}\nDate: {date_str}"]

        # 3. Construct chunk texts with email context
        chunks_to_embed: List[str] = []
        for text in body_chunks:
            chunk_to_embed = (
                f"Subject: {subject}\n"
                f"From: {from_addr}\n"
                f"To: {to_addr}\n"
                f"Date: {date_str}\n\n"
                f"{text}"
            )
            chunks_to_embed.append(chunk_to_embed)

        # 4. Batch generate embeddings to prevent rate limits
        batch_size = 50
        all_embeddings = []
        for i in range(0, len(chunks_to_embed), batch_size):
            batch = chunks_to_embed[i:i + batch_size]
            batch_emb = embedding.embed_documents(batch)
            all_embeddings.extend(batch_emb)

        # 5. Create and commit DocumentPages
        document_pages = [
            DocumentPages(
                chunk=chunk_str,
                data_source_id=data_sources.id,
                embedding=emb,
                meta_data=json.dumps({
                    "subject": subject,
                    "from": from_addr,
                    "to": to_addr,
                    "date": date_str,
                    "thread_id": thread_id
                })
            )
            for chunk_str, emb in zip(chunks_to_embed, all_embeddings)
        ]

        db.add_all(document_pages)

        # 6. Mark status as completed
        data_sources.status = Status.completed
        db.commit()

        return {
            "message": f"Gmail message #{message_id[:8]} indexed successfully into Synapse.",
            "message_id": message_id,
            "chunks_count": len(document_pages)
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error processing Gmail message {message_id}: {str(e)}", exc_info=True)
        if data_sources:
            data_sources.status = Status.failed
            db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to process email message: {str(e)}")


@router.get("/gmail/list/history")
async def get_history(
    start_history_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Fetches Gmail history records using startHistoryId or user's stored historyId."""
    if not current_user.google_refresh_token:
        raise HTTPException(status_code=401, detail="No Google refresh token found.")

    history_id = start_history_id or current_user.gmailHistoryId
    if not history_id:
        raise HTTPException(
            status_code=400,
            detail="start_history_id parameter or user's gmailHistoryId is required for history tracking."
        )

    google_access_token = await get_google_access_token(
        str(current_user.google_refresh_token), db, current_user
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            url="https://gmail.googleapis.com/gmail/v1/users/me/history",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={"startHistoryId": history_id}
        )

    if response.status_code == 401:
        current_user.google_refresh_token = None
        db.commit()
        raise HTTPException(status_code=401, detail="Google access revoked. Please log in again.")

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Gmail history API error: {response.text}"
        )

    return response.json()
