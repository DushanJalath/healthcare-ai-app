from pydantic import BaseModel, EmailStr
from ..models.user import UserRole
from typing import Optional

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    role: UserRole
    clinic_name: Optional[str] = None  # Required if role is clinic_admin
    clinic_license: Optional[str] = None  # Required if role is clinic_admin