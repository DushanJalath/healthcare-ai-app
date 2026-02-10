import re
import bleach
import hashlib
try:
    import magic
except (ImportError, OSError):
    magic = None  # e.g. libmagic not installed (common on Windows)
from pathlib import Path
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, Request
from fastapi.security import HTTPBearer
import time
from collections import defaultdict
import threading

# Rate limiting
class RateLimiter:
    def __init__(self):
        self.requests = defaultdict(list)
        self.lock = threading.Lock()
    
    def is_allowed(self, identifier: str, max_requests: int = 100, window: int = 3600) -> bool:
        """Check if request is within rate limit."""
        current_time = time.time()
        
        with self.lock:
            # Clean old requests
            self.requests[identifier] = [
                req_time for req_time in self.requests[identifier]
                if current_time - req_time < window
            ]
            
            # Check if under limit
            if len(self.requests[identifier]) < max_requests:
                self.requests[identifier].append(current_time)
                return True
            
            return False

# Global rate limiter instance
rate_limiter = RateLimiter()

# Input sanitization
def sanitize_text(text: str, max_length: int = 1000) -> str:
    """Sanitize text input to prevent XSS and other attacks."""
    if not text:
        return ""
    
    # Truncate if too long
    text = text[:max_length]
    
    # Remove/escape HTML tags
    text = bleach.clean(text, tags=[], attributes={}, strip=True)
    
    # Remove potential script injections
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'javascript:', '', text, flags=re.IGNORECASE)
    text = re.sub(r'on\w+\s*=', '', text, flags=re.IGNORECASE)
    
    return text.strip()

def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal and other attacks."""
    if not filename:
        return "unknown_file"
    
    # Remove directory traversal attempts
    filename = filename.replace('..', '').replace('/', '').replace('\\', '')
    
    # Remove special characters except basic ones
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    
    # Ensure filename isn't empty or just dots
    if not filename or filename.replace('.', '').replace('_', '').replace('-', '') == '':
        filename = "sanitized_file"
    
    return filename[:100]  # Limit length

def validate_email(email: str) -> bool:
    """Validate email format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

def validate_patient_id(patient_id: str) -> bool:
    """Validate patient ID format."""
    # Allow alphanumeric and basic separators
    pattern = r'^[a-zA-Z0-9._-]{1,20}$'
    return bool(re.match(pattern, patient_id))

def validate_phone(phone: str) -> bool:
    """Validate phone number format."""
    # Remove spaces and common separators
    phone_clean = re.sub(r'[\s\-\(\)\+]', '', phone)
    # Check if it's numeric and reasonable length
    return phone_clean.isdigit() and 7 <= len(phone_clean) <= 15

# File security
def get_file_mime_type(file_path: str) -> str:
    """Get actual MIME type using python-magic (if available)."""
    if magic is None:
        return "application/octet-stream"
    try:
        return magic.from_file(file_path, mime=True)
    except Exception:
        return "application/octet-stream"

def scan_file_content(file_path: str) -> Dict[str, Any]:
    """Basic file content scanning for security threats."""
    security_report = {
        "safe": True,
        "issues": [],
        "file_hash": "",
        "actual_mime_type": ""
    }
    
    try:
        # Calculate file hash
        with open(file_path, 'rb') as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()
            security_report["file_hash"] = file_hash
        
        # Get actual MIME type
        actual_mime = get_file_mime_type(file_path)
        security_report["actual_mime_type"] = actual_mime
        
        # Check for suspicious content in text files
        if actual_mime.startswith('text/'):
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read(10000)  # Read first 10KB
                
                # Check for script tags and suspicious patterns
                suspicious_patterns = [
                    r'<script[^>]*>',
                    r'javascript:',
                    r'eval\s*\(',
                    r'document\.(write|cookie)',
                    r'window\.(location|open)',
                ]
                
                for pattern in suspicious_patterns:
                    if re.search(pattern, content, re.IGNORECASE):
                        security_report["safe"] = False
                        security_report["issues"].append(f"Suspicious pattern found: {pattern}")
        
        # Check file size (basic DoS protection)
        file_size = Path(file_path).stat().st_size
        if file_size > 50 * 1024 * 1024:  # 50MB limit
            security_report["safe"] = False
            security_report["issues"].append("File too large")
    
    except Exception as e:
        security_report["safe"] = False
        security_report["issues"].append(f"Scan error: {str(e)}")
    
    return security_report

# SQL Injection prevention helpers
def validate_sql_input(input_value: Any) -> bool:
    """Basic SQL injection pattern detection."""
    if not isinstance(input_value, str):
        return True
    
    # Common SQL injection patterns
    sql_patterns = [
        r'(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC)\b)',
        r'(--|\#|\/\*|\*\/)',
        r'(\bOR\b.*=.*\bOR\b)',
        r'(\bAND\b.*=.*\bAND\b)',
        r'(\'|\"|\;)',
    ]
    
    for pattern in sql_patterns:
        if re.search(pattern, input_value, re.IGNORECASE):
            return False
    
    return True


def sanitize_error_message_for_display(msg: Optional[str], max_length: int = 500) -> Optional[str]:
    """Make server-generated error text safe for API response (passes SQL/security validators)."""
    if not msg or not msg.strip():
        return None
    s = msg.strip()[:max_length]
    # Replace chars that trigger SQL-injection validator so response still validates
    s = s.replace("'", "`").replace('"', " ").replace(";", ",")
    return s if s else None


def get_client_ip(request: Request) -> str:
    """Get client IP address for rate limiting."""
    # Check for forwarded headers (when behind proxy)
    forwarded_for = request.headers.get('X-Forwarded-For')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    
    real_ip = request.headers.get('X-Real-IP')
    if real_ip:
        return real_ip
    
    # Fallback to direct connection
    if hasattr(request.client, 'host'):
        return request.client.host
    
    return "unknown"