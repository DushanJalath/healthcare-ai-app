"""Phone normalization (E.164) and login lookup helpers."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional

import phonenumbers
from phonenumbers import NumberParseException
from sqlalchemy.orm import Session

from ..config import settings

if TYPE_CHECKING:
    from ..models.user import User

PHONE_PLACEHOLDER_EMAIL_SUFFIX = "@phone-login.local"


def placeholder_email_for_phone_account() -> str:
    """Synthetic unique email so DB NOT NULL constraint is satisfied for phone-only users."""
    return f"pid.{uuid.uuid4().hex}{PHONE_PLACEHOLDER_EMAIL_SUFFIX}"


def is_placeholder_login_email(email: Optional[str]) -> bool:
    return bool(email and email.endswith(PHONE_PLACEHOLDER_EMAIL_SUFFIX))


def parse_to_e164(raw: Optional[str], default_region: Optional[str] = None) -> Optional[str]:
    """Parse a phone string to E.164, or None if invalid."""
    if not raw or not str(raw).strip():
        return None
    text = str(raw).strip()
    primary = (default_region or settings.default_phone_region or "LK").strip() or "LK"
    # National numbers like 076xxxxxxx only parse correctly with region LK. If DEFAULT_PHONE_REGION
    # was ever US (or unset wrongly), the first parse fails — retry with LK for Sri Lanka deployments.
    regions_to_try = [primary]
    if primary.upper() != "LK":
        regions_to_try.append("LK")

    for region in regions_to_try:
        try:
            num = phonenumbers.parse(text, region)
            if phonenumbers.is_valid_number(num):
                return phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)
        except NumberParseException:
            continue
    return None


def find_user_by_login_identifier(db: Session, raw: str) -> Optional["User"]:
    """Resolve a user by email address or phone (any common input format)."""
    from ..models.user import User  # local import avoids cycles

    raw = (raw or "").strip()
    if not raw:
        return None

    e164 = parse_to_e164(raw)
    if e164:
        by_phone = db.query(User).filter(User.phone == e164).first()
        if by_phone:
            return by_phone

    if "@" in raw:
        return db.query(User).filter(User.email == raw.lower()).first()

    return None
