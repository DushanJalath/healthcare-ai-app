from datetime import datetime, timedelta
from typing import Optional
import bcrypt
from jose import JWTError, jwt
from ..config import settings

# bcrypt has a 72-byte limit; we truncate to bytes to avoid ValueError with bcrypt 4+
BCRYPT_MAX_PASSWORD_BYTES = 72

def _password_bytes(password: str) -> bytes:
    """Encode password to bytes and truncate to 72 bytes (bcrypt limitation)."""
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > BCRYPT_MAX_PASSWORD_BYTES:
        password_bytes = password_bytes[:BCRYPT_MAX_PASSWORD_BYTES]
    return password_bytes

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hash."""
    if not hashed_password or not hashed_password.startswith("$2"):
        return False
    try:
        return bcrypt.checkpw(
            _password_bytes(plain_password),
            hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password,
        )
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """Generate password hash using bcrypt."""
    return bcrypt.hashpw(
        _password_bytes(password),
        bcrypt.gensalt(),
    ).decode("utf-8")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token."""
    to_encode = data.copy()
    to_encode.update({"type": "access"})
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create JWT refresh token (long-lived)."""
    to_encode = data.copy()
    to_encode.update({"type": "refresh"})
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def verify_token(token: str) -> Optional[str]:
    """Verify JWT access token and return email."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        token_type = payload.get("type")
        if token_type is not None and token_type != "access":
            return None
        email: str = payload.get("sub")
        if email is None:
            return None
        return email
    except JWTError:
        return None


def verify_refresh_token(token: str) -> Optional[str]:
    """Verify JWT refresh token and return email."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "refresh":
            return None
        email: str = payload.get("sub")
        if email is None:
            return None
        return email
    except JWTError:
        return None