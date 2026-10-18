from fastapi import APIRouter

# Modular routers
from app.api.auth import router as auth_router
from app.api.drive import router as drive_router
from app.api.gmail import router as gmail_router
from app.api.sync import router as sync_router
from app.api.chat import router as chat_router

# Re-exports for backwards compatibility
from app.api.auth import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    GOOGLE_DRIVE_SCOPE,
    GOOGLE_GMAIL_SCOPE,
    GOOGLE_AUTH_URL,
    GOOGLE_TOKEN_URL,
    frontend_url,
    BACKEND_URL,
    bearer_scheme,
    create_access_token,
    verify_token,
    get_current_user,
    get_google_access_token,
    get_auth_url,
    auth_google,
)
from app.api.drive import (
    workspace_mimes,
    workspace_extensions,
    mime_extensions,
    splitter,
    embedding,
    vector_store,
    get_file_info,
    get_drive_files,
    download_file,
    search_drive_files,
)
from app.api.gmail import (
    extract_email_data_for_embeddings,
    relevant_headers,
    extract_content,
    findContent,
    decode_payload_data,
    get_all_gmail_messages,
    download_gmail_message,
    get_history,
)
from app.api.sync import (
    sync_messages,
    get_task_id,
)
from app.api.chat import (
    get_ai_message,
)

router = APIRouter(tags=["admin"])

router.include_router(auth_router)
router.include_router(drive_router)
router.include_router(gmail_router)
router.include_router(sync_router)
router.include_router(chat_router)
