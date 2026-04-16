"""
Test Text.lk credential SMS (same request shape as app.utils.sms.send_patient_credentials_sms).

  Mock (default — no network, no app imports):
    cd backend && python scripts/test_textlk_credentials_sms.py

  Live (real SMS — reads backend/.env, uses your credits):
    cd backend && python scripts/test_textlk_credentials_sms.py --live +94771234567
    cd backend && python scripts/test_textlk_credentials_sms.py --live 0765715582
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    env = _BACKEND / ".env"
    if env.exists():
        try:
            from dotenv import load_dotenv
        except ImportError:
            print("Install python-dotenv for --live: pip install python-dotenv", file=sys.stderr)
            sys.exit(1)
        load_dotenv(env)


def e164_to_textlk_recipient(e164: str) -> str:
    digits = re.sub(r"\D", "", e164 or "")
    if digits.startswith("00"):
        digits = digits[2:]
    return digits


def build_credential_message(
    first_name: str, login_hint: str, password: str, frontend_url: str
) -> str:
    base = frontend_url.rstrip("/")
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
    return message


def run_mock() -> None:
    e164 = "+94765715582"
    assert e164_to_textlk_recipient(e164) == "94765715582"
    msg = build_credential_message("Sam", "patient@example.com", "Temp9", "http://localhost:3000")
    assert "patient@example.com" in msg and "Temp9" in msg and "/patient/login" in msg
    payload = {
        "recipient": e164_to_textlk_recipient(e164),
        "sender_id": "TestSender",
        "type": "plain",
        "message": msg,
    }
    assert payload["recipient"] == "94765715582" and payload["type"] == "plain"
    print("OK: Text.lk payload shape (recipient digits, plain, message) matches app logic.")


def run_live(to_raw: str) -> None:
    _load_dotenv()
    try:
        import httpx
    except ImportError:
        print("Install httpx: pip install httpx", file=sys.stderr)
        sys.exit(1)

    token = (os.environ.get("TEXTLK_API_TOKEN") or "").strip()
    sender = (os.environ.get("TEXTLK_SENDER_ID") or "").strip()
    url = (
        os.environ.get("TEXTLK_SMS_SEND_URL") or "https://app.text.lk/api/v3/sms/send"
    ).strip()
    frontend = (os.environ.get("FRONTEND_URL") or "http://localhost:3000").strip()

    if not token or not sender:
        print("ERROR: Set TEXTLK_API_TOKEN and TEXTLK_SENDER_ID in backend/.env", file=sys.stderr)
        sys.exit(1)

    # Match backend phone parsing (phonenumbers + LK fallback)
    try:
        import phonenumbers
        from phonenumbers import NumberParseException
    except ImportError:
        print("Install phonenumbers: pip install phonenumbers", file=sys.stderr)
        sys.exit(1)

    region = (os.environ.get("DEFAULT_PHONE_REGION") or "LK").strip() or "LK"
    text = str(to_raw).strip()
    e164 = None
    for reg in [region, "LK"] if region.upper() != "LK" else [region]:
        try:
            num = phonenumbers.parse(text, reg)
            if phonenumbers.is_valid_number(num):
                e164 = phonenumbers.format_number(
                    num, phonenumbers.PhoneNumberFormat.E164
                )
                break
        except NumberParseException:
            continue
    if not e164:
        print(f"ERROR: Invalid phone for SMS: {to_raw!r}", file=sys.stderr)
        sys.exit(1)

    recipient = e164_to_textlk_recipient(e164)
    message = build_credential_message(
        "SMS test", "test-login@example.com", "TestOnlyPass1", frontend
    )
    payload = {
        "recipient": recipient,
        "sender_id": sender,
        "type": "plain",
        "message": message,
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    print(f"POST {url} recipient={recipient} …")
    with httpx.Client(timeout=30.0) as client:
        r = client.post(url, headers=headers, json=payload)
    try:
        data = r.json()
    except Exception:
        print(f"ERROR: Non-JSON HTTP {r.status_code}: {r.text[:500]}", file=sys.stderr)
        sys.exit(1)

    print("Response:", json.dumps(data, indent=2)[:800])
    if r.status_code < 400 and isinstance(data, dict) and data.get("status") == "success":
        print("OK: Text.lk returned success — check the phone and your Text.lk dashboard.")
    else:
        print("FAILED: Text.lk did not return status=success.", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    p = argparse.ArgumentParser(description="Test Text.lk credential SMS")
    p.add_argument(
        "--live",
        metavar="PHONE",
        help="Send one real test SMS (uses TEXTLK_* from backend/.env)",
    )
    args = p.parse_args()
    if args.live:
        run_live(args.live)
    else:
        run_mock()


if __name__ == "__main__":
    main()
