from sqlalchemy.orm import Session
from fastapi import Request
from typing import Optional, Dict, Any, Union
from datetime import datetime
import json

from ..models.audit_log import AuditLog, AuditAction, AuditEntityType
from ..models.user import User
from ..database import get_db

class AuditLogger:
    def __init__(self, db: Session):
        self.db = db
    
    def log(
        self,
        action: AuditAction,
        entity_type: AuditEntityType,
        description: str,
        user: Optional[User] = None,
        entity_id: Optional[Union[int, str]] = None,
        entity_name: Optional[str] = None,
        clinic_id: Optional[int] = None,
        patient_id: Optional[int] = None,
        changes: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        request: Optional[Request] = None,
        success: bool = True,
        error_message: Optional[str] = None
    ) -> AuditLog:
        """Create an audit log entry."""
        
        # Get request information
        ip_address = None
        user_agent = None
        request_path = None
        
        if request:
            ip_address = self._get_client_ip(request)
            user_agent = request.headers.get("User-Agent", "")[:500]  # Limit length
            request_path = str(request.url.path)
        
        # Create audit log entry
        audit_log = AuditLog(
            user_id=user.id if user else None,
            user_email=user.email if user else None,
            user_role=user.role.value if user else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            entity_name=entity_name,
            clinic_id=clinic_id,
            patient_id=patient_id,
            description=description,
            changes=changes,
            metadata=metadata,
            ip_address=ip_address,
            user_agent=user_agent,
            request_path=request_path,
            success=success,
            error_message=error_message
        )
        
        try:
            self.db.add(audit_log)
            self.db.commit()
            self.db.refresh(audit_log)
            return audit_log
        except Exception as e:
            self.db.rollback()
            print(f"Failed to create audit log: {str(e)}")
            return audit_log  # Return without saving
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address from request."""
        # Check for forwarded headers (when behind proxy)
        forwarded_for = request.headers.get('X-Forwarded-For')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
        
        real_ip = request.headers.get('X-Real-IP')
        if real_ip:
            return real_ip
        
        # Fallback to direct connection
        if hasattr(request.client, 'host'):
            return request.client.host
        
        return "unknown"

    def log_user_action(
        self,
        action: AuditAction,
        user: User,
        description: str,
        request: Optional[Request] = None,
        **kwargs
    ):
        """Log a user action."""
        return self.log(
            action=action,
            entity_type=AuditEntityType.USER,
            entity_id=user.id,
            entity_name=f"{user.first_name} {user.last_name}",
            user=user,
            description=description,
            request=request,
            **kwargs
        )
    
    def log_document_action(
        self,
        action: AuditAction,
        user: User,
        document_id: int,
        document_name: str,
        description: str,
        request: Optional[Request] = None,
        **kwargs
    ):
        """Log a document-related action."""
        return self.log(
            action=action,
            entity_type=AuditEntityType.DOCUMENT,
            entity_id=document_id,
            entity_name=document_name,
            user=user,
            description=description,
            request=request,
            **kwargs
        )
    
    def log_patient_action(
        self,
        action: AuditAction,
        user: User,
        patient_id: int,
        patient_name: str,
        description: str,
        request: Optional[Request] = None,
        **kwargs
    ):
        """Log a patient-related action."""
        return self.log(
            action=action,
            entity_type=AuditEntityType.PATIENT,
            entity_id=patient_id,
            entity_name=patient_name,
            user=user,
            description=description,
            patient_id=patient_id,
            request=request,
            **kwargs
        )

# Helper function to get audit logger
def get_audit_logger(db: Session) -> AuditLogger:
    """Get an AuditLogger instance."""
    return AuditLogger(db)

# Decorator for automatic audit logging
def audit_action(
    action: AuditAction,
    entity_type: AuditEntityType,
    description_template: str = None
):
    """Decorator to automatically audit function calls."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            # This would need more sophisticated implementation
            # to extract parameters and create audit logs
            return func(*args, **kwargs)
        return wrapper
    return decorator