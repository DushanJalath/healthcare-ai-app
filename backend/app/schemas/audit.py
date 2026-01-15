from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from ..models.audit_log import AuditAction, AuditEntityType

class AuditLogBase(BaseModel):
    action: AuditAction
    entity_type: AuditEntityType
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    description: str
    success: bool = True

class AuditLogResponse(AuditLogBase):
    id: int
    user_id: Optional[int]
    user_email: Optional[str]
    user_role: Optional[str]
    clinic_id: Optional[int]
    patient_id: Optional[int]
    changes: Optional[Dict[str, Any]]
    metadata: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    user_agent: Optional[str]
    request_path: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

class AuditLogListResponse(BaseModel):
    logs: List[AuditLogResponse]
    total: int
    page: int
    per_page: int

class AuditLogFilter(BaseModel):
    action: Optional[AuditAction] = None
    entity_type: Optional[AuditEntityType] = None
    user_id: Optional[int] = None
    clinic_id: Optional[int] = None
    patient_id: Optional[int] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    success: Optional[bool] = None

class AuditLogStats(BaseModel):
    total_logs: int
    logs_today: int
    logs_this_week: int
    logs_this_month: int
    top_actions: Dict[str, int]
    top_entities: Dict[str, int]
    recent_activities: List[AuditLogResponse]