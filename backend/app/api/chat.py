from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.api.chatbot import chat_bot_fn
from typing import Optional

router = APIRouter(tags=["chat"])


@router.get("/ai-message")
async def get_ai_message(query: str, thread_id: Optional[str] = None):
    return StreamingResponse(
        chat_bot_fn(query=query, thread_id=thread_id),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "Content-Type": "text/plain; charset=utf-8",
            "X-Accel-Buffering": "no",
        }
    )
