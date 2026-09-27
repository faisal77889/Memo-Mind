from celery import Celery
from typing import List, Optional

celery_app = Celery(
    "worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)

@celery_app.task(name="tasks.sync-gmail-messages")
def sync_gmail_messages(user_id: int, message_ids: Optional[List[str]] = None):
    pass

@celery_app.task(name="tasks.sync-drive-messages")
def sync_drive_messages(user_id: int, message_ids: Optional[List[str]] = None):
    pass
