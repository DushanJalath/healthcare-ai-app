from pydantic import validator, BaseModel
from typing import Optional, Any
from .security import (
    sanitize_text, sanitize_filename, validate_email, 
    validate_patient_id, validate_phone, validate_sql_input
)

class SecurityValidatorMixin:
    """Mixin class to add security validation to Pydantic models."""
    
    @validator('*', pre=True)
    def prevent_sql_injection(cls, value):
        """Global validator to prevent SQL injection."""
        if isinstance(value, str) and not validate_sql_input(value):
            raise ValueError("Invalid input detected")
        return value

class SecureTextValidator:
    """Validators for text fields."""
    
    @classmethod
    def sanitize_name(cls, value: str) -> str:
        if not value:
            raise ValueError("Name cannot be empty")
        
        sanitized = sanitize_text(value, max_length=100)
        if len(sanitized) < 2:
            raise ValueError("Name must be at least 2 characters")
        
        return sanitized
    
    @classmethod
    def sanitize_notes(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        
        sanitized = sanitize_text(value, max_length=2000)
        return sanitized if sanitized else None
    
    @classmethod
    def validate_patient_id_field(cls, value: str) -> str:
        if not value:
            raise ValueError("Patient ID cannot be empty")
        
        if not validate_patient_id(value):
            raise ValueError("Invalid patient ID format")
        
        return value
    
    @classmethod
    def validate_email_field(cls, value: str) -> str:
        if not value:
            raise ValueError("Email cannot be empty")
        
        if not validate_email(value):
            raise ValueError("Invalid email format")
        
        return value.lower()
    
    @classmethod
    def validate_phone_field(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        
        if not validate_phone(value):
            raise ValueError("Invalid phone number format")
        
        return value

class SecureFileValidator:
    """Validators for file-related fields."""
    
    @classmethod
    def sanitize_filename_field(cls, value: str) -> str:
        if not value:
            raise ValueError("Filename cannot be empty")
        
        return sanitize_filename(value)
    
    @classmethod
    def validate_file_size(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("File size must be positive")
        
        if value > 50 * 1024 * 1024:  # 50MB
            raise ValueError("File too large")
        
        return value