from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, extract
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from ..database import get_db
from ..models.clinic import Clinic
from ..models.patient import Patient, Gender
from ..models.patient_clinic import PatientClinic
from ..models.document import Document, DocumentType, DocumentStatus
from ..models.user import User, UserRole
from ..models.audit_log import AuditLog
from ..schemas.clinic import (
    ClinicResponse, ClinicUpdate, ClinicDashboardStats, ClinicOverview
)
from ..schemas.user import UserResponse
from ..utils.deps import get_current_active_user, require_clinic_access

def get_user_clinic(current_user: User, db: Session) -> Optional[Clinic]:
    """Get clinic for user (handles both clinic_admin and clinic_staff)."""
    # Both clinic_admin and clinic_staff now have clinic_id in User model
    if current_user.clinic_id:
        clinic = db.query(Clinic).filter(Clinic.id == current_user.clinic_id).first()
        if clinic:
            return clinic
    
    # Fallback for clinic_admin: find clinic by admin_user_id (for backward compatibility)
    if current_user.role == UserRole.CLINIC_ADMIN:
        clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
        if clinic:
            return clinic
    
    return None

router = APIRouter(prefix="/clinic", tags=["clinic"])

@router.get("/profile", response_model=ClinicResponse)
async def get_clinic_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Get current clinic profile."""
    
    clinic = get_user_clinic(current_user, db)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    return ClinicResponse.from_orm(clinic)

@router.put("/profile", response_model=ClinicResponse)
async def update_clinic_profile(
    clinic_update: ClinicUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Update clinic profile."""
    
    # Only clinic_admin can update clinic profile
    if current_user.role != UserRole.CLINIC_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clinic administrators can update clinic profile"
        )
    
    clinic = get_user_clinic(current_user, db)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    # Update fields
    update_data = clinic_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(clinic, field, value)
    
    db.commit()
    db.refresh(clinic)
    
    return ClinicResponse.from_orm(clinic)

@router.get("/dashboard", response_model=ClinicDashboardStats)
async def get_clinic_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Get comprehensive clinic dashboard statistics."""
    
    clinic = get_user_clinic(current_user, db)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    # Time ranges
    now = datetime.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    
    # Basic counts - use PatientClinic for accurate multi-clinic support
    total_patients = db.query(Patient).join(PatientClinic).filter(
        PatientClinic.clinic_id == clinic.id,
        PatientClinic.is_active == True
    ).distinct().count()
    total_documents = db.query(Document).filter(Document.clinic_id == clinic.id).count()
    
    # This month stats - use PatientClinic
    patients_this_month = db.query(Patient).join(PatientClinic).filter(
        PatientClinic.clinic_id == clinic.id,
        PatientClinic.is_active == True,
        Patient.created_at >= month_start
    ).distinct().count()
    
    documents_this_month = db.query(Document).filter(
        Document.clinic_id == clinic.id,
        Document.upload_date >= month_start
    ).count()
    
    # Storage calculation
    storage_used = db.query(func.sum(Document.file_size)).filter(
        Document.clinic_id == clinic.id
    ).scalar() or 0
    
    # Processing queue
    processing_queue = db.query(Document).filter(
        Document.clinic_id == clinic.id,
        Document.status.in_([DocumentStatus.UPLOADED, DocumentStatus.PROCESSING])
    ).count()
    
    # Recent activity
    recent_activity = _get_recent_activity(clinic.id, db, limit=10)
    
    # Popular document types
    doc_type_stats = db.query(
        Document.document_type, 
        func.count(Document.id)
    ).filter(
        Document.clinic_id == clinic.id
    ).group_by(Document.document_type).all()
    
    popular_document_types = {
        doc_type.value: count for doc_type, count in doc_type_stats
    }
    
    # Patient demographics
    patient_demographics = _get_patient_demographics(clinic.id, db)
    
    # System alerts
    system_alerts = _get_system_alerts(clinic.id, db)
    
    return ClinicDashboardStats(
        total_patients=total_patients,
        total_documents=total_documents,
        documents_this_month=documents_this_month,
        patients_this_month=patients_this_month,
        storage_used=storage_used,
        processing_queue=processing_queue,
        recent_activity=recent_activity,
        popular_document_types=popular_document_types,
        patient_demographics=patient_demographics,
        system_alerts=system_alerts
    )

@router.get("/overview", response_model=ClinicOverview)
async def get_clinic_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Get complete clinic overview for dashboard."""
    
    clinic_info = await get_clinic_profile(db, current_user)
    stats = await get_clinic_dashboard_stats(db, current_user)
    
    quick_actions = [
        {"title": "Add Patient", "action": "create_patient", "icon": "user-plus"},
        {"title": "Upload Documents", "action": "upload_documents", "icon": "upload"},
        {"title": "View Reports", "action": "view_reports", "icon": "chart-bar"},
        {"title": "Clinic Settings", "action": "clinic_settings", "icon": "cog"},
    ]
    
    return ClinicOverview(
        clinic_info=clinic_info,
        stats=stats,
        quick_actions=quick_actions
    )

@router.get("/users", response_model=List[UserResponse])
async def get_clinic_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Get all users associated with the current user's clinic."""
    
    clinic = get_user_clinic(current_user, db)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    # Get all users with this clinic_id (clinic_admin and clinic_staff)
    users = db.query(User).filter(
        User.clinic_id == clinic.id,
        User.role.in_([UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF])
    ).order_by(User.created_at.desc()).all()
    
    return [UserResponse.from_orm(user) for user in users]

def _get_recent_activity(clinic_id: int, db: Session, limit: int = 10) -> List[Dict[str, Any]]:
    """Get recent clinic activity."""
    
    activities = []
    
    # Recent patient registrations - use PatientClinic
    recent_patients = db.query(Patient).join(PatientClinic).filter(
        PatientClinic.clinic_id == clinic_id,
        PatientClinic.is_active == True
    ).order_by(Patient.created_at.desc()).distinct().limit(5).all()
    
    for patient in recent_patients:
        activities.append({
            "type": "patient_registered",
            "title": f"New patient registered: {patient.patient_id}",
            "timestamp": patient.created_at,
            "icon": "user-plus",
            "color": "green"
        })
    
    # Recent document uploads
    recent_documents = db.query(Document).filter(
        Document.clinic_id == clinic_id
    ).order_by(Document.upload_date.desc()).limit(5).all()
    
    for doc in recent_documents:
        activities.append({
            "type": "document_uploaded",
            "title": f"Document uploaded: {doc.original_filename}",
            "timestamp": doc.upload_date,
            "icon": "document",
            "color": "blue"
        })
    
    # Sort by timestamp and limit
    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    return activities[:limit]

def _get_patient_demographics(clinic_id: int, db: Session) -> Dict[str, Any]:
    """Get patient demographic breakdown - optimized to use SQL instead of loading all patients."""
    
    # Gender distribution - use PatientClinic
    gender_stats = db.query(Patient.gender, func.count(Patient.id)).join(PatientClinic).filter(
        PatientClinic.clinic_id == clinic_id,
        PatientClinic.is_active == True
    ).group_by(Patient.gender).all()
    
    gender_distribution = {
        str(gender.value) if gender else 'not_specified': count 
        for gender, count in gender_stats
    }
    
    # Age distribution - calculate using SQL date ranges (approximate but much faster)
    from datetime import date
    today = date.today()
    
    # Get patients with DOB count
    patients_with_dob_count = db.query(Patient).join(PatientClinic).filter(
        PatientClinic.clinic_id == clinic_id,
        PatientClinic.is_active == True,
        Patient.date_of_birth.isnot(None)
    ).distinct().count()
    
    # Calculate birth year ranges for each age group (approximate - uses year only)
    # This is much faster than loading all patients and calculating exact age
    current_year = today.year
    max_birth_year_18 = current_year - 18
    max_birth_year_35 = current_year - 35
    max_birth_year_55 = current_year - 55
    max_birth_year_70 = current_year - 70
    
    # Use a single query with conditional aggregation for better performance
    from sqlalchemy import case
    
    # Build a query that counts patients in each age group
    # We'll use year-based calculation (approximate but fast)
    base_query = db.query(Patient).join(PatientClinic).filter(
        PatientClinic.clinic_id == clinic_id,
        PatientClinic.is_active == True,
        Patient.date_of_birth.isnot(None)
    ).distinct()
    
    # Count each age group (using year-based approximation)
    birth_year = func.extract('year', Patient.date_of_birth)
    
    age_0_18 = base_query.filter(birth_year >= max_birth_year_18).count()
    age_19_35 = base_query.filter(
        birth_year < max_birth_year_18,
        birth_year >= max_birth_year_35
    ).count()
    age_36_55 = base_query.filter(
        birth_year < max_birth_year_35,
        birth_year >= max_birth_year_55
    ).count()
    age_56_70 = base_query.filter(
        birth_year < max_birth_year_55,
        birth_year >= max_birth_year_70
    ).count()
    age_71_plus = base_query.filter(birth_year < max_birth_year_70).count()
    
    age_groups = {
        '0-18': age_0_18,
        '19-35': age_19_35,
        '36-55': age_36_55,
        '56-70': age_56_70,
        '71+': age_71_plus
    }
    
    return {
        "gender_distribution": gender_distribution,
        "age_distribution": age_groups,
        "total_with_age_data": patients_with_dob_count
    }

def _get_system_alerts(clinic_id: int, db: Session) -> List[Dict[str, Any]]:
    """Get system alerts and notifications."""
    
    alerts = []
    
    # Check for failed document processing
    failed_docs = db.query(Document).filter(
        Document.clinic_id == clinic_id,
        Document.status == DocumentStatus.FAILED
    ).count()
    
    if failed_docs > 0:
        alerts.append({
            "type": "warning",
            "title": f"{failed_docs} document(s) failed processing",
            "message": "Review failed documents and retry processing",
            "action": "view_failed_documents"
        })
    
    # Check storage usage (if over 80% of some limit)
    storage_used = db.query(func.sum(Document.file_size)).filter(
        Document.clinic_id == clinic_id
    ).scalar() or 0
    
    storage_limit = 5 * 1024 * 1024 * 1024  # 5GB limit
    if storage_used > storage_limit * 0.8:
        alerts.append({
            "type": "info",
            "title": "Storage limit approaching",
            "message": f"Using {storage_used / 1024 / 1024:.1f}MB of storage",
            "action": "manage_storage"
        })
    
    # Check for unprocessed documents
    unprocessed = db.query(Document).filter(
        Document.clinic_id == clinic_id,
        Document.status == DocumentStatus.UPLOADED
    ).count()
    
    if unprocessed > 10:
        alerts.append({
            "type": "info",
            "title": f"{unprocessed} documents waiting for processing",
            "message": "Consider processing pending documents",
            "action": "process_documents"
        })
    
    return alerts