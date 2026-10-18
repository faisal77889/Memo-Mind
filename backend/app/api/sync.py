from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from celery.result import AsyncResult

from app.database import get_db
from app.models import User, SourceType
from app.tasks import celery_app, sync_gmail_messages, sync_drive_messages
from app.api.auth import get_current_user

router = APIRouter(tags=["sync"])


@router.post("/sync-message")
def sync_messages( source: Optional[SourceType] = Query(None, description="Source to sync messages from"),current_user : User = Depends(get_current_user),db : Session = Depends(get_db)):
    if source == SourceType.gdrive:
        task = sync_drive_messages.delay(user_id=current_user.id)
        return {
            "message" : f"gdrive messages added in the task with {task.id}"
        }
    elif source == SourceType.gmail:
        task = sync_gmail_messages.delay(user_id=current_user.id)
        return {
            "message" : f"gmail messages added in the task with {task.id}"
        }
    else:
        task1 = sync_gmail_messages.delay(user_id=current_user.id)
        task2 = sync_drive_messages.delay(user_id=current_user.id)
        return {
            "message" : f"gmail messages and gdrive added in the task with {task1.id} and {task2.id} respectively"
        }


@router.get("/task/status/{task_id}")
def get_task_id(task_id : str,current_user : User = Depends(get_current_user),db : Session = Depends(get_db)):
    task_result = AsyncResult(task_id, app=celery_app)
    
    result = None
    if task_result.ready():
        result = str(task_result.result) if task_result.failed() else task_result.result

    return {
        "task_id": task_id,
        "status": task_result.status,  
        "result": result
    }
