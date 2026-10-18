from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.api.chatbot import chat_bot_fn

router = APIRouter(tags=["chat"])


@router.get("/ai-message")
async def get_ai_message(query : str):
    return StreamingResponse(chat_bot_fn(query=query),media_type="text/plain")
