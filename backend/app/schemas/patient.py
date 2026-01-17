from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import date, datetime
from ..models.patient import Gender
from ..utils.validators import SecurityValidatorMixin, SecureTextValidator

class PatientBase(BaseModel, SecurityValidatorMixin):
    patient_id: str
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    medical_history: Optional[str] = None
    allergies: Optional[str] = None
    current_medications: Optional[str] = None

    @validator('patient_id')
    def validate_patient_id(cls, v):
        return SecureTextValidator.validate_patient_id_field(v)
    
    @validator('phone')
    def validate_phone(cls, v):
        return SecureTextValidator.validate_phone_field(v) if v else None
    
    @validator('emergency_contact_phone')
    def validate_emergency_phone(cls, v):
        return SecureTextValidator.validate_phone_field(v) if v else None
    
    @validator('emergency_contact_name')
    def validate_emergency_name(cls, v):
        return SecureTextValidator.sanitize_name(v) if v else None
    
    @validator('medical_history', 'allergies', 'current_medications', 'address')
    def validate_text_fields(cls, v):
        return SecureTextValidator.sanitize_notes(v) if v else None

class PatientCreate(PatientBase):
    user_id: Optional[int] = None
    clinic_id: Optional[int] = None  # Will be set from current user's clinic

class PatientUpdate(BaseModel, SecurityValidatorMixin):
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    medical_history: Optional[str] = None
    allergies: Optional[str] = None
    current_medications: Optional[str] = None

    @validator('phone', 'emergency_contact_phone')
    def validate_phones(cls, v):
        return SecureTextValidator.validate_phone_field(v) if v else None
    
    @validator('emergency_contact_name')
    def validate_emergency_name(cls, v):
        return SecureTextValidator.sanitize_name(v) if v else None
    
    @validator('medical_history', 'allergies', 'current_medications', 'address')
    def validate_text_fields(cls, v):
        return SecureTextValidator.sanitize_notes(v) if v else None

class PatientResponse(PatientBase):
    id: int
    user_id: Optional[int]
    clinic_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class PatientDetailResponse(PatientResponse):
    user_first_name: Optional[str] = None
    user_last_name: Optional[str] = None
    user_email: Optional[str] = None
    clinic_name: Optional[str] = None
    documents_count: Optional[int] = 0
    last_visit: Optional[datetime] = None

class PatientListResponse(BaseModel):
    patients: List[PatientDetailResponse]
    total: int
    page: int
    per_page: int

class PatientSearchRequest(BaseModel, SecurityValidatorMixin):
    query: Optional[str] = None
    gender: Optional[Gender] = None
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    has_allergies: Optional[bool] = None
    
    @validator('query')
    def sanitize_query(cls, v):
        return SecureTextValidator.sanitize_notes(v)[:100] if v else None

class PatientStatsResponse(BaseModel):
    total_patients: int
    new_patients_this_month: int
    patients_by_gender: dict
    patients_by_age_group: dict
    patients_with_documents: int
    recent_patients: List[PatientDetailResponse]