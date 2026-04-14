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

    # Twilio (SMS for patient credentials). Optional until configured.
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_from_number: Optional[str] = None  # E.164, e.g. +15551234567
    default_phone_region: str = "US"  # ISO region for parsing national numbers

    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra environment variables like GOOGLE_APPLICATION_CREDENTIALS

settings = Settings()