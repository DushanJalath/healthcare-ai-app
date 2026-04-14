from pydantic import BaseModel, EmailStr, model_validator
from ..models.user import UserRole
from typing import Any, Optional

class LoginRequest(BaseModel):
    """Sign-in with email or mobile (E.164 or national format)."""
    email_or_phone: str
    password: str

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_email_key(cls, data: Any):
        if isinstance(data, dict) and "email_or_phone" not in data and data.get("email") is not None:
            data = {**data, "email_or_phone": data["email"]}
        return data


class RegisterRequest(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str
    first_name: str
    last_name: str
    role: UserRole
    clinic_name: Optional[str] = None  # Required if role is clinic_admin
    clinic_license: Optional[str] = None  # Required if role is clinic_admin

    @model_validator(mode="after")
    def require_contact_for_patients(self):
        if self.role == UserRole.PATIENT:
            has_email = bool(self.email)
            has_phone = bool(self.phone and str(self.phone).strip())
            if not has_email and not has_phone:
                raise ValueError("Provide an email or a phone number to register as a patient")
        else:
            if not self.email:
                raise ValueError("Email is required for this account type")
        return self