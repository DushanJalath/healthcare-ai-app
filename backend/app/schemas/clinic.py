from pydantic import BaseModel, validator, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from ..models.clinic import ClinicType
from ..utils.validators import SecurityValidatorMixin, SecureTextValidator


class ClinicStaffRegisterRequest(BaseModel, SecurityValidatorMixin):
    """Minimal fields for clinic admin to register staff tied to a clinic via license number."""
    email: EmailStr
    first_name: str
    last_name: str
    clinic_license: str

    @validator("first_name", "last_name")
    def validate_names(cls, v):
        return SecureTextValidator.sanitize_name(v)

    @validator("email")
    def validate_email_security(cls, v):
        return SecureTextValidator.validate_email_field(str(v))

    @validator("clinic_license")
    def validate_license(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Clinic license number is required")
        return v


class ClinicStaffUpdateRequest(BaseModel, SecurityValidatorMixin):
    """Clinic admin edits staff profile (same clinic)."""
    first_name: str
    last_name: str
    email: EmailStr

    @validator("first_name", "last_name")
    def validate_names(cls, v):
        return SecureTextValidator.sanitize_name(v)

    @validator("email")
    def validate_email_security(cls, v):
        return SecureTextValidator.validate_email_field(str(v))

class ClinicBase(BaseModel, SecurityValidatorMixin):
    name: str
    license_number: str
    clinic_type: Optional[ClinicType] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    
    @validator('name')
    def validate_name(cls, v):
        return SecureTextValidator.sanitize_name(v)
    
    @validator('phone')
    def validate_phone(cls, v):
        return SecureTextValidator.validate_phone_field(v) if v else None
    
    @validator('email')
    def validate_email(cls, v):
        return SecureTextValidator.validate_email_field(v) if v else None
    
    @validator('address')
    def validate_address(cls, v):
        return SecureTextValidator.sanitize_notes(v) if v else None

class ClinicCreate(ClinicBase):
    admin_user_id: int

class ClinicUpdate(BaseModel, SecurityValidatorMixin):
    name: Optional[str] = None
    license_number: Optional[str] = None
    clinic_type: Optional[ClinicType] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

    @validator("license_number")
    def validate_license_number(cls, v):
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("License number cannot be empty")
        return v

class ClinicResponse(ClinicBase):
    id: int
    admin_user_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class ClinicDashboardStats(BaseModel):
    total_patients: int
    total_staff: int
    total_documents: int
    documents_this_month: int
    patients_this_month: int
    storage_used: int
    processing_queue: int
    recent_activity: List[Dict[str, Any]]
    popular_document_types: Dict[str, int]
    patient_demographics: Dict[str, Any]
    system_alerts: List[Dict[str, Any]]

class ClinicOverview(BaseModel):
    clinic_info: ClinicResponse
    stats: ClinicDashboardStats
    quick_actions: List[Dict[str, str]]