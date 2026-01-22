from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Email settings for Google App Password
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: Optional[str] = None  # Gmail address
    smtp_password: Optional[str] = None  # Google App Password
    email_from: Optional[str] = None
    email_from_name: str = "Healthcare AI System"
    frontend_url: str = "http://localhost:3000"  # For login links in emails
    
    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra environment variables like GOOGLE_APPLICATION_CREDENTIALS

settings = Settings()