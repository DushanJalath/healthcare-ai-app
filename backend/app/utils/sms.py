"""Twilio SMS for patient onboarding (credentials)."""
import logging

from ..config import settings

logger = logging.getLogger(__name__)


def send_patient_credentials_sms(
    to_e164: str,
    login_hint: str,
    password: str,
    first_name: str,
) -> bool:
    """
    Send temporary login details via SMS.

    ``login_hint`` is what the patient types at sign-in (email or E.164 phone).
    """
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        logger.warning("Twilio is not configured; SMS will not be sent.")
        return False
    if not settings.twilio_from_number:
        logger.warning("TWILIO_FROM_NUMBER is not set; SMS will not be sent.")
        return False

    try:
        from twilio.rest import Client
    except ImportError:
        logger.error("twilio package is not installed.")
        return False

    base = settings.frontend_url.rstrip("/")
    login_url = f"{base}/patient/login"
    body = (
        f"Hello {first_name}, your MediKeep account is ready. "
        f"Sign in with: {login_hint} "
        f"Temporary password: {password} "
        f"Login: {login_url} "
        f"Please change your password after signing in."
    )
    if len(body) > 1500:
        body = body[:1490] + "…"

    try:
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            body=body,
            from_=settings.twilio_from_number,
            to=to_e164,
        )
        logger.info("Patient credentials SMS sent to %s", to_e164)
        return True
    except Exception as e:
        logger.error("Failed to send SMS to %s: %s", to_e164, e)
        return False
