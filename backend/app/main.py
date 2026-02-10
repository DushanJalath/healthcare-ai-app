from pathlib import Path
import os

# Load .env from backend directory so GEMINI_API_KEY and other vars are in os.environ
# (Pydantic Settings only loads fields defined on Settings; other keys need dotenv)
_backend_dir = Path(__file__).resolve().parent.parent
_env_path = _backend_dir / ".env"
if _env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_path)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import engine, Base
from .models import User, Clinic, Patient, Document, Extraction
from .routers import auth_router, users_router
from .routers.documents import router as documents_router
from .routers.patients import router as patients_router
from .routers.patient_dashboard import router as patient_dashboard_router
from .routers.clinic import router as clinic_router
from .routers.audit import router as audit_router
from .routers.share import router as share_router

# Create database tables
Base.metadata.create_all(bind=engine)

# Create upload directory structure using absolute path
# This ensures directories are created relative to the backend folder, not the current working directory
backend_dir = _backend_dir
uploads_base = backend_dir / "uploads"
upload_dirs = [
    uploads_base / "documents",
    uploads_base / "temp",
    uploads_base / "quarantine",
    uploads_base / "deleted",
    uploads_base / "backups"
]

print(f"Initializing upload directories at: {uploads_base}")
for dir_path in upload_dirs:
    try:
        dir_path.mkdir(parents=True, exist_ok=True)
        # Verify directory is writable
        if not dir_path.exists():
            raise OSError(f"Directory was not created: {dir_path}")
        if not os.access(dir_path, os.W_OK):
            raise PermissionError(f"Directory is not writable: {dir_path}")
        print(f"[OK] Created/verified directory: {dir_path}")
    except (OSError, PermissionError) as e:
        print(f"[ERROR] Could not create directory {dir_path}: {e}")
        print(f"  Please check permissions and ensure the path is accessible.")
        # Don't exit here, but log the error - the file_handler will handle it

# Initialize FastAPI app
app = FastAPI(
    title="Healthcare AI API",
    description="Healthcare AI platform for medical document analysis",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploads
# Use absolute path to ensure consistency
app.mount("/uploads", StaticFiles(directory=str(uploads_base)), name="uploads")

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(documents_router)
app.include_router(patients_router)
app.include_router(patient_dashboard_router)
app.include_router(clinic_router)
app.include_router(audit_router)
app.include_router(share_router)

@app.get("/")
async def root():
    return {"message": "Healthcare AI API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)