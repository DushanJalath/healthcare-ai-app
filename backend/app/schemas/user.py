from pydantic import BaseModel, EmailStr, validator
from typing import Optional
from datetime import datetime
from ..models.user import UserRole
from ..utils.validators import SecurityValidatorMixin, SecureTextValidator

class UserBase(BaseModel, SecurityValidatorMixin):
    email: EmailStr
    first_name: str
    last_name: str
    role: UserRole
    
    # Validators
    @validator('first_name')
    def validate_first_name(cls, v):
        return SecureTextValidator.sanitize_name(v)
    
    @validator('last_name')
    def validate_last_name(cls, v):
        return SecureTextValidator.sanitize_name(v)
    
    @validator('email')
    def validate_email_security(cls, v):
        return SecureTextValidator.validate_email_field(str(v))

class UserCreate(UserBase):
    password: str
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

class UserUpdate(BaseModel, SecurityValidatorMixin):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    
    @validator('first_name')
    def validate_first_name(cls, v):
        return SecureTextValidator.sanitize_name(v) if v else None
    
    @validator('last_name')
    def validate_last_name(cls, v):
        return SecureTextValidator.sanitize_name(v) if v else None

class UserResponse(BaseModel):
    """API user shape; email may be absent for phone-only patients (internal placeholder hidden)."""
    id: int
    email: Optional[str] = None
    phone: Optional[str] = None
    first_name: str
    last_name: str
    role: UserRole
    is_active: bool
    is_verified: bool
    created_at: datetime
    clinic_id: Optional[int] = None
    clinic_license_number: Optional[str] = None
    clinic_name: Optional[str] = None

    @validator("first_name")
    def validate_first_name(cls, v):
        return SecureTextValidator.sanitize_name(v)

    @validator("last_name")
    def validate_last_name(cls, v):
        return SecureTextValidator.sanitize_name(v)

    @validator("email")
    def validate_email_when_present(cls, v):
        if v is None or not str(v).strip():
            return None
        return SecureTextValidator.validate_email_field(str(v))

    class Config:
        from_attributes = True


def user_response_from_user(user) -> UserResponse:
    """Build UserResponse including clinic license/name when the user has a clinic (loads clinic if needed)."""
    from ..utils.phone import is_placeholder_login_email

    license_num: Optional[str] = None
    clinic_display_name: Optional[str] = None
    if getattr(user, "clinic_id", None):
        clinic = getattr(user, "clinic", None)
        if clinic is not None:
            license_num = clinic.license_number
            clinic_display_name = clinic.name

    raw_email = getattr(user, "email", None)
    display_email = None if is_placeholder_login_email(raw_email) else raw_email

    return UserResponse(
        id=user.id,
        email=display_email,
        phone=getattr(user, "phone", None),
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        is_active=user.is_active,
        is_verified=user.is_verified,
        created_at=user.created_at,
        clinic_id=user.clinic_id,
        clinic_license_number=license_num,
        clinic_name=clinic_display_name,
    )

class UserLogin(BaseModel):
    email_or_phone: str
    password: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
    
    @validator('new_password')
    def validate_new_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int