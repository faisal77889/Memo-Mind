from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from typing import List
import os
import base64
import json
import httpx
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.database import get_db
from app.models import User, DataSources, SourceType, Status, DocumentPages
from app.api.auth import get_current_user, get_google_access_token

load_dotenv(override=True)

router = APIRouter(tags=["gmail"])

splitter = RecursiveCharacterTextSplitter(
    chunk_size = 400,
    chunk_overlap = 50
)

embedding = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001",output_dimensionality=768)


def extract_email_data_for_embeddings(payload: dict) -> dict:
    # 1. Extract only relevant headers
    headers = {
        h["name"].lower(): h["value"]
        for h in payload.get("headers", [])
        if "name" in h
    }

    metadata = {
        "subject": headers.get("subject", ""),
        "from": headers.get("from", ""),
        "to": headers.get("to", ""),
        "date": headers.get("date", ""),
    }

    # 2. Extract content prioritizing text/plain over text/html
    text_plain = None
    text_html = None

    for part in payload.get("parts", []):
        mime_type = part.get("mimeType", "")
        data = part.get("body", {}).get("data", "")

        if mime_type == "text/plain" and data:
            text_plain = data
        elif mime_type == "text/html" and data:
            text_html = data

    # 3. Determine final text to embed
    if text_plain:
        final_content = text_plain.strip()
    elif text_html:
        # Fallback only if plain text was not provided

        soup = BeautifulSoup(text_html, "html.parser")
        final_content = soup.get_text(separator="\n", strip=True)
    else:
        final_content = ""

    # 4. Construct the chunk text to be embedded
    chunk_to_embed = (
        f"Subject: {metadata['subject']}\n"
        f"From: {metadata['from']}\n"
        f"Date: {metadata['date']}\n\n"
        f"{final_content}"
    )

    

    return {
        "metadata": metadata,
        "content_for_embedding": chunk_to_embed,
        "raw_text_length": len(final_content),
    }

relevant_headers = ["From","To","Subject","Date"]

def extract_content(parts : dict):
    mimeType = parts.get("mimeType")
    if mimeType == "text/plain":
        return parts.get("body").get("data")
        
    if mimeType == "text/html":
        raw_html = parts.get("body").get('data')
        soup = BeautifulSoup(raw_html,'html.parser')
        data = soup.get_text(separator="\n", strip=True)
        return  data
        

        

def findContent(payload : dict) -> dict:

    mimeType = payload.get("mimeType")
    headers = payload.get("headers")

    headers_obj = {} 

    for obj in headers:
        if obj.get('name') in relevant_headers:
            headers_obj[obj.get("name")] = obj.get("value")

    data = None

    if mimeType == "multipart/alternative":
        data = extract_content(parts=payload.get("parts")[0])

    elif mimeType == "multipart/mixed":
        part = payload.get("parts")[0]
        part_mimeType = part.get("mimeType")
        if part_mimeType == "multipart/alternative":
            data = extract_content(parts=part.get(parts)[0])
        else:
            data = extract_content(parts=payload.get(parts)[0])
        # file = payload.get("parts")[1]

    elif mimeType == "text/plain":
        data = payload.get("body").get("data")

    elif mimeType == "text/html":
        soup = BeautifulSoup(payload.get("body").get("data"),'html.parser')
        data = soup.get_text(separator="\n", strip=True)
    # it must be multipart/related
    else:
        part = payload.get("parts")[0]
        part_mimeType = part.get("mimeType")
        if part_mimeType == "multipart/alternative":
            data = extract_content(parts=part.get(parts)[0])
        else:
            data = extract_content(parts=payload.get(parts)[0])

    return {
        "metadata" : headers_obj,
        "raw_content" : data
    }





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

@router.get("/gmail/list")
async def get_all_gmail_messages(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    # first error is what if refresh token has expired - to be fixed 
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

    thread_id = message_data.get("threadId")

    payload = message_data.get("payload")
    if isinstance(payload, dict):
        decode_payload_data(payload)

    gmail_json = findContent(payload)
    gmail_content = json.dumps(gmail_json)
    # gmail_json = extract_email_data_for_embeddings(payload)
    if not gmail_json:
        raise HTTPException(status_code=400,detail="gmail is not extracted properly")

    print(gmail_json)

    gmail_json["threadId"] = thread_id


    data_sources = DataSources(
        name = gmail_json.get("metadata","").get("Subject"),
        mimeType = payload.get("mimeType"),
        type = SourceType.gmail,
        thread_id = thread_id,
        unique_id = message_id,
        content = gmail_content,
        status = Status.pending,
        user_id = current_user.id
    )

    db.add(data_sources)
    db.commit()

    body_chunks : List[str] = splitter.split_text(gmail_json.get("raw_content"))

    if not body_chunks:
        body_chunks = gmail_json.get("raw_content")


    document_pages = []
    for idx, text in enumerate(body_chunks):
        chunk_to_embed = (
            f"Subject: {gmail_json.get('metadata', {}).get('Subject', '')}\n"
            f"From: {gmail_json.get('metadata', {}).get('From', '')}\n"
            f"Date: {gmail_json.get('metadata', {}).get('To', '')}\n\n"
            f"{text}"
        )
        vector_embedding = embedding.embed_query(chunk_to_embed)
        
        doc_page = DocumentPages(
            chunk = chunk_to_embed,
            data_source_id = data_sources.id,
            embedding = vector_embedding
        )
        document_pages.append(doc_page)

    db.add_all(document_pages)
    db.commit()
    return {
        "message" : f"gmail with message id - {message_id} is saved successfully"
    }


@router.get("/gmail/list/history")
async def get_history(current_user : User = Depends(get_current_user), db : Session = Depends(get_db)):
    google_access_token = await get_google_access_token(str(current_user.google_refresh_token),db,current_user)
    print(current_user.id)
    print("the google access token is ",google_access_token)
    if not google_access_token:
        raise HTTPException(status_code=401,detail="No google access token is found")
    async with httpx.AsyncClient() as client:
        response = await client.get(url="https://gmail.googleapis.com/gmail/v1/users/me/history",headers={
            "Authorization": f"Bearer {google_access_token}"
        })

    if response.status_code == 401:
        raise HTTPException(status_code=401,detail="unauthorized via google access token")

    # if response.status_code != 200 :
    #     raise HTTPException(status_code=401,detail="Something is wrong")

    return response.json()
