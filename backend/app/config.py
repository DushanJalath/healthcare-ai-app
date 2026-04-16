from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    
    # Email settings for Google App Password
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: Optional[str] = None  # Gmail address
    smtp_password: Optional[str] = None  # Google App Password
    email_from: Optional[str] = None
    email_from_name: str = "Healthcare AI System"
    frontend_url: str = "http://localhost:3000"  # For login links in emails

    # Text.lk SMS (Sri Lanka) — patient credential messages. Optional until configured.
    # Token from app.text.lk → Developers. sender_id = approved sender name or number (see Text.lk docs).
    textlk_api_token: Optional[str] = None
    textlk_sender_id: Optional[str] = None
    textlk_sms_send_url: str = "https://app.text.lk/api/v3/sms/send"
    default_phone_region: str = "LK"  # ISO region for parsing national numbers (Sri Lanka)

    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra environment variables like GOOGLE_APPLICATION_CREDENTIALS

settings = Settings()