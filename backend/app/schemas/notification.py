from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from ..models.notification import NotificationType


class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    notification_type: NotificationType
    is_read: bool
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    notifications: List[NotificationResponse]
    total: int
    unread_count: int


class UnreadCountResponse(BaseModel):
    unread_count: int
