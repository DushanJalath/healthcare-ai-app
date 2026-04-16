"""Text.lk SMS gateway (Sri Lanka) for patient onboarding messages."""
from __future__ import annotations

import logging
import re
from typing import Any, Dict

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


def _e164_to_textlk_recipient(e164: str) -> str:
    """Text.lk expects MSISDN digits with country code, e.g. 94771234567 (no +)."""
    digits = re.sub(r"\D", "", e164 or "")
    if digits.startswith("00"):
        digits = digits[2:]
    return digits


def send_patient_credentials_sms(
    to_e164: str,
    login_hint: str,
    password: str,
    first_name: str,
) -> bool:
    """
    Send temporary login details via SMS (Text.lk).

    ``login_hint`` is what the patient types at sign-in (email or E.164 phone).
    """
    if not settings.textlk_api_token or not settings.textlk_sender_id:
        logger.warning("Text.lk is not configured (TEXTLK_API_TOKEN / TEXTLK_SENDER_ID); SMS will not be sent.")
        return False

    recipient = _e164_to_textlk_recipient(to_e164)
    if not recipient:
        logger.warning("Cannot derive Text.lk recipient from %r", to_e164)
        return False

    base = settings.frontend_url.rstrip("/")
    login_url = f"{base}/patient/login"
    message = (
        f"Hello {first_name}, your MediKeep account is ready. "
        f"Sign in with: {login_hint} "
        f"Temporary password: {password} "
        f"Login: {login_url} "
        f"Please change your password after signing in."
    )
    if len(message) > 1500:
        message = message[:1490] + "…"

    payload: Dict[str, Any] = {
        "recipient": recipient,
        "sender_id": settings.textlk_sender_id.strip(),
        "type": "plain",
        "message": message,
    }

    url = (settings.textlk_sms_send_url or "").strip() or "https://app.text.lk/api/v3/sms/send"
    headers = {
        "Authorization": f"Bearer {settings.textlk_api_token.strip()}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, headers=headers, json=payload)
        try:
            data = response.json()
        except Exception:
            logger.error(
                "Text.lk non-JSON response for recipient=%s status=%s body=%s",
                recipient,
                response.status_code,
                response.text[:500],
            )
            return False

        if response.status_code >= 400:
            logger.error(
                "Text.lk HTTP %s for recipient=%s: %s",
                response.status_code,
                recipient,
                data if isinstance(data, dict) else response.text[:500],
            )
            return False

        if isinstance(data, dict) and data.get("status") == "success":
            logger.info("Patient credentials SMS sent via Text.lk to %s", recipient)
            return True

        logger.error("Text.lk send failed for recipient=%s: %s", recipient, data)
        return False
    except httpx.RequestError as e:
        logger.error("Text.lk request error for recipient=%s: %s", recipient, e)
        return False
