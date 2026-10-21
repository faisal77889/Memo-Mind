import os
import jwt
import asyncio
from typing import Optional, List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db, SessionMaker
from app.models import User, ChatActivity, Activity
from app.api.auth import get_current_user, verify_token
from app.api.chatbot import chat_bot_fn

router = APIRouter(tags=["chat"])


# ----------------------------------------------------
# Pydantic Request & Response Schemas
# ----------------------------------------------------
class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Conversation"


class RenameSessionRequest(BaseModel):
    title: str


class TurnResponse(BaseModel):
    id: int
    query: str
    answer: str
    order: int
    created_at: datetime


class SessionItemResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    total_messages: int
    last_active: datetime
    preview: str
    activity_level: str  # "active", "recent", "idle"


class SessionDetailResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    total_messages: int
    turns: List[TurnResponse]


class ActivityStatsResponse(BaseModel):
    total_conversations: int
    total_messages: int
    active_days: int
    last_active: Optional[datetime] = None


# Helper to authenticate via Bearer header OR query param 'token' (vital for fetch/SSE streaming)
def resolve_user_from_token(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    auth_token = None
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization.split(" ")[1]
    elif token:
        auth_token = token

    if not auth_token:
        return None

    try:
        payload = verify_token(auth_token)
        user_id = int(payload.get("sub"))
        return db.query(User).filter(User.id == user_id).first()
    except Exception:
        return None


# Helper to determine activity level based on last_active
def compute_activity_level(last_active: datetime) -> str:
    now = datetime.utcnow()
    diff = now - last_active
    if diff < timedelta(hours=2):
        return "active"
    elif diff < timedelta(days=2):
        return "recent"
    return "idle"


# ----------------------------------------------------
# Chat Session Management Endpoints
# ----------------------------------------------------
@router.get("/chat/sessions", response_model=List[SessionItemResponse])
def get_chat_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns all chat sessions for the authenticated user, along with calculated
    activity metrics (total message turns, last active time, activity status, preview).
    """
    sessions = (
        db.query(ChatActivity)
        .filter(ChatActivity.user_id == current_user.id)
        .order_by(desc(ChatActivity.updated_at))
        .all()
    )

    result = []
    for s in sessions:
        total_turns = len(s.activities)
        last_turn = s.activities[-1] if s.activities else None
        last_active = last_turn.created_at if last_turn else s.updated_at
        preview = (
            last_turn.query[:80] + ("..." if len(last_turn.query) > 80 else "")
            if last_turn
            else "No messages yet"
        )
        activity_level = compute_activity_level(last_active)

        result.append(
            SessionItemResponse(
                id=s.id,
                title=s.title,
                created_at=s.created_at,
                updated_at=s.updated_at,
                total_messages=total_turns,
                last_active=last_active,
                preview=preview,
                activity_level=activity_level,
            )
        )

    return result


@router.post("/chat/sessions", response_model=SessionItemResponse, status_code=status.HTTP_201_CREATED)
def create_chat_session(
    payload: CreateSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Creates a new conversation session for the user.
    """
    new_session = ChatActivity(
        user_id=current_user.id,
        title=payload.title.strip() if payload.title else "New Conversation",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return SessionItemResponse(
        id=new_session.id,
        title=new_session.title,
        created_at=new_session.created_at,
        updated_at=new_session.updated_at,
        total_messages=0,
        last_active=new_session.updated_at,
        preview="No messages yet",
        activity_level="active",
    )


@router.get("/chat/sessions/{chat_id}", response_model=SessionDetailResponse)
def get_chat_session_details(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieves full message turn history for a chat session so the user can easily
    resume and continue their past conversation.
    """
    session = (
        db.query(ChatActivity)
        .filter(ChatActivity.id == chat_id, ChatActivity.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat conversation not found")

    turns = [
        TurnResponse(
            id=a.id,
            query=a.query,
            answer=a.answer,
            order=a.order,
            created_at=a.created_at,
        )
        for a in session.activities
    ]

    return SessionDetailResponse(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        total_messages=len(turns),
        turns=turns,
    )


@router.patch("/chat/sessions/{chat_id}", response_model=SessionItemResponse)
def rename_chat_session(
    chat_id: int,
    payload: RenameSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Renames a chat session.
    """
    session = (
        db.query(ChatActivity)
        .filter(ChatActivity.id == chat_id, ChatActivity.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat conversation not found")

    session.title = payload.title.strip() or "Untitled Conversation"
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)

    total_turns = len(session.activities)
    last_turn = session.activities[-1] if session.activities else None
    last_active = last_turn.created_at if last_turn else session.updated_at
    preview = last_turn.query[:80] if last_turn else "No messages yet"

    return SessionItemResponse(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        total_messages=total_turns,
        last_active=last_active,
        preview=preview,
        activity_level=compute_activity_level(last_active),
    )


@router.delete("/chat/sessions/{chat_id}")
def delete_chat_session(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently deletes a chat session and all underlying message turn activities.
    """
    session = (
        db.query(ChatActivity)
        .filter(ChatActivity.id == chat_id, ChatActivity.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat conversation not found")

    db.delete(session)
    db.commit()
    return {"message": "Chat conversation deleted successfully", "id": chat_id}


@router.get("/chat/activity-stats", response_model=ActivityStatsResponse)
def get_user_chat_activity_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Calculates overall chat activity for the current user:
    - Total conversation sessions
    - Total message turns exchanged
    - Number of distinct active days
    - Most recent activity timestamp
    """
    total_convs = (
        db.query(func.count(ChatActivity.id))
        .filter(ChatActivity.user_id == current_user.id)
        .scalar()
        or 0
    )

    # Total activities across all user's chats
    total_turns = (
        db.query(func.count(Activity.id))
        .join(ChatActivity, Activity.chat_id == ChatActivity.id)
        .filter(ChatActivity.user_id == current_user.id)
        .scalar()
        or 0
    )

    # Distinct days of activity
    active_days = (
        db.query(func.count(func.distinct(func.date(Activity.created_at))))
        .join(ChatActivity, Activity.chat_id == ChatActivity.id)
        .filter(ChatActivity.user_id == current_user.id)
        .scalar()
        or 0
    )

    # Latest activity timestamp
    last_act = (
        db.query(func.max(Activity.created_at))
        .join(ChatActivity, Activity.chat_id == ChatActivity.id)
        .filter(ChatActivity.user_id == current_user.id)
        .scalar()
    )

    return ActivityStatsResponse(
        total_conversations=total_convs,
        total_messages=total_turns,
        active_days=active_days,
        last_active=last_act,
    )


# ----------------------------------------------------
# Real-Time Streaming AI Chat Endpoint
# ----------------------------------------------------
@router.get("/ai-message")
async def get_ai_message(
    query: str,
    chat_id: Optional[int] = Query(None),
    thread_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Streams AI response for `query`.
    - If authenticated and `chat_id` is provided, loads past conversation history to continue context.
    - If authenticated and no `chat_id` provided, automatically creates a new ChatActivity session.
    - Upon stream completion, persists the (query, answer) turn into PostgreSQL `activities` table.
    """
    user = resolve_user_from_token(authorization, token, db)
    history: List[dict] = []
    active_chat_id = chat_id

    if user:
        if active_chat_id:
            # Verify chat session ownership
            session_obj = (
                db.query(ChatActivity)
                .filter(ChatActivity.id == active_chat_id, ChatActivity.user_id == user.id)
                .first()
            )
            if session_obj:
                # Load previous turns for continuity
                for turn in session_obj.activities:
                    history.append({"query": turn.query, "answer": turn.answer})
            else:
                active_chat_id = None

        if not active_chat_id:
            # Generate sensible title from first question (first 6 words)
            words = query.strip().split()
            auto_title = " ".join(words[:6])
            if len(words) > 6:
                auto_title += "..."
            new_session = ChatActivity(
                user_id=user.id,
                title=auto_title or "New Conversation",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(new_session)
            db.commit()
            db.refresh(new_session)
            active_chat_id = new_session.id

    # Persistence callback triggered when streaming finishes
    def save_completed_turn(answer_text: str):
        if not user or not active_chat_id or not answer_text.strip():
            return
        # Open a fresh database session for the background commit
        turn_db = SessionMaker()
        try:
            # Calculate next order index
            max_order = (
                turn_db.query(func.max(Activity.order))
                .filter(Activity.chat_id == active_chat_id)
                .scalar()
                or 0
            )
            new_act = Activity(
                chat_id=active_chat_id,
                query=query.strip(),
                answer=answer_text.strip(),
                order=max_order + 1,
                created_at=datetime.utcnow(),
            )
            turn_db.add(new_act)

            # Touch chat updated_at
            chat_row = turn_db.query(ChatActivity).filter(ChatActivity.id == active_chat_id).first()
            if chat_row:
                chat_row.updated_at = datetime.utcnow()
                # If chat title was generic or default, update it with first query preview
                if chat_row.title in ["New Conversation", "Untitled Conversation"]:
                    words = query.strip().split()
                    chat_row.title = " ".join(words[:6]) + ("..." if len(words) > 6 else "")

            turn_db.commit()
        except Exception as e:
            turn_db.rollback()
        finally:
            turn_db.close()

    # Pass history and persistence callback to chat_bot_fn
    response_generator = chat_bot_fn(
        query=query,
        thread_id=thread_id or (f"chat-{active_chat_id}" if active_chat_id else None),
        history=history,
        on_finish=save_completed_turn,
    )

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Accel-Buffering": "no",
    }
    if active_chat_id:
        headers["X-Chat-Id"] = str(active_chat_id)

    return StreamingResponse(
        response_generator,
        media_type="text/plain; charset=utf-8",
        headers=headers,
    )
