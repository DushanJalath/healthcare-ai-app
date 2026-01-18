from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import os
import shutil
from ..database import get_db
from ..models.user import User, UserRole
from ..models.patient import Patient
from ..models.clinic import Clinic
from ..models.document import Document
from ..models.extraction import Extraction
from ..models.audit_log import AuditLog
from ..schemas.user import UserResponse, UserUpdate, ChangePasswordRequest
from ..utils.deps import get_current_active_user, require_admin
from ..utils.auth import verify_password, get_password_hash

class DeleteAccountRequest(BaseModel):
    password: str

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/", response_model=List[UserResponse])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get all users (admin only)."""
    users = db.query(User).offset(skip).limit(limit).all()
    return [UserResponse.from_orm(user) for user in users]

@router.get("/profile", response_model=UserResponse)
async def get_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user profile."""
    return UserResponse.from_orm(current_user)

@router.put("/profile", response_model=UserResponse)
async def update_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update current user profile."""
    update_data = user_update.dict(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    db.commit()
    db.refresh(current_user)
    return UserResponse.from_orm(current_user)

@router.post("/change-password")
async def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Change user password. User will need to log in again after password change."""
    # Verify old password
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    
    # Check if new password is different from old password
    if verify_password(password_data.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )
    
    # Hash and update password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()
    
    return {"message": "Password changed successfully. Please log in again."}

def _delete_document_files(documents: List[Document]):
    """Helper function to delete document files from filesystem."""
    for doc in documents:
        if doc.file_path and os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except Exception:
                pass  # Continue even if file deletion fails

@router.delete("/account")
async def delete_account(
    delete_request: DeleteAccountRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete current user account permanently along with all related data."""
    # Verify password
    if not verify_password(delete_request.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password"
        )
    
    # Delete audit logs for this user
    db.query(AuditLog).filter(AuditLog.user_id == current_user.id).delete()
    
    # Delete associated patient profile and related data if exists
    if current_user.role == UserRole.PATIENT:
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if patient:
            # Delete audit logs referencing this patient
            db.query(AuditLog).filter(AuditLog.patient_id == patient.id).delete()
            
            # Get documents to delete files
            patient_docs = db.query(Document).filter(Document.patient_id == patient.id).all()
            _delete_document_files(patient_docs)
            
            # Delete extractions for patient's documents
            db.query(Extraction).filter(Extraction.patient_id == patient.id).delete()
            
            # Delete documents for this patient from database
            db.query(Document).filter(Document.patient_id == patient.id).delete()
            
            # Delete patient
            db.delete(patient)
    
    # Delete associated clinic and related data if user is clinic admin
    if current_user.role == UserRole.CLINIC_ADMIN:
        clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
        if clinic:
            # Delete audit logs referencing this clinic
            db.query(AuditLog).filter(AuditLog.clinic_id == clinic.id).delete()
            
            # Get all patients in this clinic
            clinic_patients = db.query(Patient).filter(Patient.clinic_id == clinic.id).all()
            for patient in clinic_patients:
                # Delete audit logs for these patients
                db.query(AuditLog).filter(AuditLog.patient_id == patient.id).delete()
                
                # Get documents to delete files
                patient_docs = db.query(Document).filter(Document.patient_id == patient.id).all()
                _delete_document_files(patient_docs)
                
                # Delete extractions for patient
                db.query(Extraction).filter(Extraction.patient_id == patient.id).delete()
                # Delete documents for patient from database
                db.query(Document).filter(Document.patient_id == patient.id).delete()
            
            # Delete all patients in clinic
            db.query(Patient).filter(Patient.clinic_id == clinic.id).delete()
            
            # Get remaining clinic documents to delete files
            clinic_docs = db.query(Document).filter(Document.clinic_id == clinic.id).all()
            _delete_document_files(clinic_docs)
            
            # Delete extractions for clinic documents
            for doc in clinic_docs:
                db.query(Extraction).filter(Extraction.document_id == doc.id).delete()
            
            # Delete all documents in clinic from database
            db.query(Document).filter(Document.clinic_id == clinic.id).delete()
            
            # Delete clinic
            db.delete(clinic)
    
    # For clinic_staff - they don't own data, just delete audit logs and user
    # (audit logs already deleted above)
    
    # Delete the user
    db.delete(current_user)
    db.commit()
    
    return {"message": "Account and all related data deleted successfully"}