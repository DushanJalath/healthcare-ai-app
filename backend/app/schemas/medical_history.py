from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import date, datetime

from ..models.medical_history import MedicalEntryStatus
from ..utils.validators import SecurityValidatorMixin, SecureTextValidator


class MedicalHistoryEntryCreate(BaseModel, SecurityValidatorMixin):
    title: str
    condition: Optional[str] = None
    description: Optional[str] = None
    medications: Optional[str] = None
    treating_doctor: Optional[str] = None
    clinic_name: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    status: MedicalEntryStatus = MedicalEntryStatus.RESOLVED

    @validator("title")
    def validate_title(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Title is required")
        if len(v) > 255:
            raise ValueError("Title must be 255 characters or fewer")
        return SecureTextValidator.sanitize_notes(v)

    @validator("condition", "treating_doctor", "clinic_name")
    def validate_short_text(cls, v):
        if v:
            return SecureTextValidator.sanitize_notes(v)[:255]
        return v

    @validator("description", "medications")
    def validate_long_text(cls, v):
        return SecureTextValidator.sanitize_notes(v) if v else v

    @validator("end_date")
    def validate_end_date(cls, v, values):
        if v and "start_date" in values and values["start_date"] and v < values["start_date"]:
            raise ValueError("End date cannot be before start date")
        return v

    @validator("status")
    def validate_status_with_end_date(cls, v, values):
        if v == MedicalEntryStatus.ONGOING and values.get("end_date"):
            raise ValueError("Ongoing entries should not have an end date")
        return v


class MedicalHistoryEntryUpdate(BaseModel, SecurityValidatorMixin):
    title: Optional[str] = None
    condition: Optional[str] = None
    description: Optional[str] = None
    medications: Optional[str] = None
    treating_doctor: Optional[str] = None
    clinic_name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[MedicalEntryStatus] = None

    @validator("title")
    def validate_title(cls, v):
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Title cannot be empty")
            return SecureTextValidator.sanitize_notes(v)[:255]
        return v

    @validator("condition", "treating_doctor", "clinic_name")
    def validate_short_text(cls, v):
        if v:
            return SecureTextValidator.sanitize_notes(v)[:255]
        return v

    @validator("description", "medications")
    def validate_long_text(cls, v):
        return SecureTextValidator.sanitize_notes(v) if v else v


class MedicalHistoryEntryResponse(BaseModel):
    id: int
    patient_id: int
    title: str
    condition: Optional[str] = None
    description: Optional[str] = None
    medications: Optional[str] = None
    treating_doctor: Optional[str] = None
    clinic_id: Optional[int] = None
    clinic_name: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    status: MedicalEntryStatus
    created_by: int
    created_by_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MedicalHistoryListResponse(BaseModel):
    entries: List[MedicalHistoryEntryResponse]
    total: int
