from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os
import httpx
from langchain_postgres import PGVector
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader

from app.database import get_db
from app.models import User, DataSources, SourceType, Status, DocumentPages
from app.api.auth import get_current_user, get_google_access_token

load_dotenv(override=True)

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

    # return file_response.json()


    if file_response.status_code == 401:
        current_user.google_refresh_token = None
        db.commit()
        raise HTTPException(status_code=401, detail="Google access revoked. Please log in again.")

    mimeType = file_response.json().get("mimeType", "")
    is_workspace = mimeType.startswith("application/vnd.google-apps") if mimeType else False

    data_source = DataSources(
        type = SourceType.gdrive,
        unique_id = file_id,
        user_id = current_user.id,
        name = file_response.json().get("name",""),
        mimeType = mimeType,
        status = Status.pending
    )
    db.add(data_source)
    db.commit()

    async with httpx.AsyncClient() as client:
        if is_workspace:
            url = f"https://www.googleapis.com/drive/v3/files/{file_id}/export"
            params = {"mimeType": workspace_mimes.get(mimeType, "application/pdf")}
            ext = workspace_extensions.get(mimeType, "pdf")
            filename = f"{file_id}.{ext}"
        else:
            url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
            params = {"alt" : "media"}
            ext = mime_extensions.get(mimeType, "pdf")
            filename = f"{file_id}.{ext}"
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

    loader = PyPDFLoader(filename)

    document_pages = []

    for page_doc in loader.lazy_load():
        chunks = splitter.split_documents([page_doc])
        page_num = page_doc.metadata.get("page", 0)

        if not chunks:
            continue
        
        chunk_text = []
        doc_array = []
        for chunk in chunks:
            chunk_text.append(chunk.page_content)
            vectors = embedding.embed_query(chunk.page_content)
            doc = DocumentPages(
                meta_data = page_num,
                data_source_id = data_source.id,
                chunk = chunk.page_content,
                embedding = vectors
            )
            doc_array.append(doc)

        for doc_page in doc_array:
            document_pages.append(doc_page)

    # save it to the database 
    db.add_all(document_pages)
    db.commit()

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
