from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Enum, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from ..database import Base

class AuditAction(enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    VIEW = "view"
    DOWNLOAD = "download"
    LOGIN = "login"
    LOGOUT = "logout"
    UPLOAD = "upload"
    ASSIGN = "assign"
    PROCESS = "process"
    EXPORT = "export"   

class AuditEntityType(enum.Enum):
    USER = "user"
    PATIENT = "patient"
    DOCUMENT = "document"
    CLINIC = "clinic"
    EXTRACTION = "extraction"
    SYSTEM = "system"

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    
    # User performing the action
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_email = Column(String, nullable=True)  # Store email for deleted users
    user_role = Column(String, nullable=True)
    
    # Action details
    action = Column(Enum(AuditAction), nullable=False)
    entity_type = Column(Enum(AuditEntityType), nullable=False)
    entity_id = Column(String, nullable=True)  # Store as string to handle different ID types
    entity_name = Column(String, nullable=True)  # Human-readable identifier
    
    # Context
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    
    # Details
    description = Column(Text, nullable=False)
    changes = Column(JSON, nullable=True)  # Before/after values for updates
    extra_metadata = Column(JSON, nullable=True)  # Additional context
    
    # Request information
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    request_path = Column(String, nullable=True)
    
    # Status
    success = Column(Boolean, default=True)  # True for success, False for failures
    error_message = Column(Text, nullable=True)
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Relationships
    user = relationship("User", back_populates="audit_logs", foreign_keys=[user_id])
    clinic = relationship("Clinic", foreign_keys=[clinic_id])
    patient = relationship("Patient", foreign_keys=[patient_id])