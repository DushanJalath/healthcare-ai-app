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
import os

# Create database tables
Base.metadata.create_all(bind=engine)

# Create upload directory
os.makedirs("uploads/documents", exist_ok=True)

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
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(documents_router)
app.include_router(patients_router)
app.include_router(patient_dashboard_router)
app.include_router(clinic_router)
app.include_router(audit_router)

@app.get("/")
async def root():
    return {"message": "Healthcare AI API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)