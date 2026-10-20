from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Any
import httpx
from langchain_postgres import PGVector
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader

from app.database import get_db
from app.models import User, DataSources, SourceType, Status, DocumentPages
from app.api.auth import get_current_user, get_google_access_token

load_dotenv(override=True)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["drive"])

splitter = RecursiveCharacterTextSplitter(
    chunk_size = 400,
    chunk_overlap = 50
)

embedding = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001",output_dimensionality=768)

vector_store = PGVector(
    embeddings=embedding,
    connection=os.getenv("DB_URL"),
    collection_name="gmail_and_docs",
    use_jsonb=True
)

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

async def get_file_info(file_id : str,google_access_token: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            url=f"https://www.googleapis.com/drive/v3/files/{file_id}",
            headers={"Authorization": f"Bearer {google_access_token}"},
            params={"fields": "id,name,mimeType,size,modifiedTime,webViewLink"}
        )
        return response


@router.get("/google/drive/files")
async def get_drive_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page_size: int = 20,
):
    print("The current user is ",current_user.google_refresh_token)
    google_access_token = await get_google_access_token(
        refresh_token=current_user.google_refresh_token,
        db=db,
        user=current_user,
    )
    try:
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
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500,detail="Internal Server Error")

    if drive_resp.status_code == 401:
        # Access token rejected → RT likely dead
        current_user.google_refresh_token = None
        db.commit()
        raise HTTPException(status_code=401, detail="Google access revoked. Please log in again.")

    if drive_resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Drive API error: {drive_resp.text}")

    return drive_resp.json()


@router.get("/download/google/drive/files/{file_id}")
@router.get("/download/drive/files/{file_id}")
async def download_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    google_access_token = await get_google_access_token(
        refresh_token=current_user.google_refresh_token,
        db=db,
        user=current_user,
    )

    file_response = await get_file_info(file_id, google_access_token)

    if file_response.status_code == 401:
        current_user.google_refresh_token = None
        db.commit()
        raise HTTPException(status_code=401, detail="Google access revoked. Please log in again.")

    if file_response.status_code != 200:
        raise HTTPException(
            status_code=file_response.status_code,
            detail=f"Failed to fetch file metadata: {file_response.text}"
        )

    file_meta = file_response.json()
    mime_type = file_meta.get("mimeType", "")
    file_name = file_meta.get("name", file_id)

    # 1. Reject folders explicitly
    if mime_type == "application/vnd.google-apps.folder":
        raise HTTPException(
            status_code=400,
            detail="Folders cannot be converted to embeddings. Please select an individual document."
        )

    # 2. Check if file already exists in database
    existing_file = db.query(DataSources).filter(DataSources.unique_id == file_id).first()
    if existing_file:
        if existing_file.status == Status.completed:
            raise HTTPException(status_code=409, detail="The file is already indexed in the database.")
        # If previous attempt was pending or failed, clear old chunks and re-use data_source
        data_source = existing_file
        data_source.name = file_name
        data_source.mimeType = mime_type
        data_source.status = Status.pending
        db.commit()
        db.query(DocumentPages).filter(DocumentPages.data_source_id == data_source.id).delete()
        db.commit()
    else:
        data_source = DataSources(
            type=SourceType.gdrive,
            unique_id=file_id,
            user_id=current_user.id,
            name=file_name,
            mimeType=mime_type,
            status=Status.pending,
            content=file_name,
        )
        db.add(data_source)
        db.commit()
        db.refresh(data_source)

    is_workspace = mime_type.startswith("application/vnd.google-apps") if mime_type else False

    if is_workspace:
        if mime_type not in workspace_mimes:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported Google Workspace format ({mime_type}) for indexing."
            )
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}/export"
        params = {"mimeType": workspace_mimes.get(mime_type, "application/pdf")}
        ext = workspace_extensions.get(mime_type, "pdf")
    else:
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
        params = {"alt": "media"}
        ext = mime_extensions.get(mime_type, "pdf")

    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"temp_drive_{file_id}_{timestamp_str}.{ext}"

    try:
        # 3. Stream download to disk
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "GET",
                url=url,
                params=params,
                headers={"Authorization": f"Bearer {google_access_token}"}
            ) as response:
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Failed to download file from Google Drive: {response.text}"
                    )
                with open(filename, "wb") as f:
                    async for chunk in response.aiter_bytes(65536):
                        f.write(chunk)

        # 4. Extract content chunks safely
        chunks_data: List[Dict[str, Any]] = []

        if ext.lower() == "pdf":
            try:
                loader = PyPDFLoader(filename)
                for page_doc in loader.lazy_load():
                    page_chunks = splitter.split_documents([page_doc])
                    page_num = page_doc.metadata.get("page", 0)
                    for ch in page_chunks:
                        text = ch.page_content.strip()
                        if text:
                            chunks_data.append({
                                "chunk": text,
                                "meta_data": json.dumps({"page": page_num})
                            })
            except Exception as e:
                logger.error(f"Error extracting PDF chunks from {filename}: {e}", exc_info=True)
                raise Exception(f"Failed to parse PDF document: {str(e)}")
        else:
            try:
                with open(filename, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                if content.strip():
                    text_chunks = splitter.split_text(content)
                    for ch in text_chunks:
                        text = ch.strip()
                        if text:
                            chunks_data.append({
                                "chunk": text,
                                "meta_data": json.dumps({"page": 1})
                            })
            except Exception as e:
                logger.error(f"Error reading file as text from {filename}: {e}", exc_info=True)
                raise Exception(f"Failed to read file as text: {str(e)}")

        # 5. Batch generate embeddings & batch save DocumentPages
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

        # 6. Update status to completed
        data_source.status = Status.completed
        data_source.content = file_name
        db.commit()

        return {
            "message": "successful",
            "file_id": file_id,
            "chunks_count": len(chunks_data)
        }

    except HTTPException:
        db.rollback()
        if data_source:
            data_source.status = Status.failed
            db.commit()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing Google Drive file {file_id}: {str(e)}", exc_info=True)
        if data_source:
            data_source.status = Status.failed
            db.commit()
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

    finally:
        # 7. Clean up downloaded local file
        if filename and os.path.exists(filename):
            try:
                os.remove(filename)
            except Exception as rm_err:
                logger.warning(f"Failed to delete local temp file {filename}: {rm_err}")



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
