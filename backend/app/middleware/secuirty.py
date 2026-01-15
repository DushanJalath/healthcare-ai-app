import time
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from ..utils.security import rate_limiter, get_client_ip

class SecurityMiddleware(BaseHTTPMiddleware):
    """Security middleware for rate limiting and basic protection."""
    
    async def dispatch(self, request: Request, call_next):
        # Rate limiting
        client_ip = get_client_ip(request)
        
        # Different limits for different endpoints
        if request.url.path.startswith('/documents/upload'):
            max_requests = 10  # 10 uploads per hour
            window = 3600
        elif request.url.path.startswith('/auth/'):
            max_requests = 5   # 5 auth attempts per hour
            window = 3600
        else:
            max_requests = 1000  # 1000 general requests per hour
            window = 3600
        
        if not rate_limiter.is_allowed(client_ip, max_requests, window):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"}
            )
        
        # Add security headers
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        
        return response

class CSRFMiddleware(BaseHTTPMiddleware):
    """Basic CSRF protection for state-changing operations."""
    
    async def dispatch(self, request: Request, call_next):
        # Skip CSRF check for safe methods
        if request.method in ["GET", "HEAD", "OPTIONS"]:
            return await call_next(request)
        
        # Skip for auth endpoints (handled by authentication)
        if request.url.path.startswith('/auth/'):
            return await call_next(request)
        
        # Check for presence of authorization header (basic CSRF protection)
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF protection: Authorization header required"}
            )
        
        return await call_next(request)