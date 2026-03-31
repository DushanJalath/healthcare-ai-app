from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
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
from ..schemas.clinic import (
    ClinicResponse,
    ClinicUpdate,
    ClinicDashboardStats,
    ClinicOverview,
    ClinicStaffRegisterRequest,
    ClinicStaffUpdateRequest,
)
from ..schemas.user import UserResponse, user_response_from_user
from ..utils.deps import require_clinic_access, require_clinic_admin
from ..utils.auth import get_password_hash
from ..utils.password import generate_secure_password
from ..utils.email import send_clinic_staff_welcome_email

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


def _get_editable_clinic_staff(
    staff_user_id: int,
    clinic: Clinic,
    db: Session,
) -> User:
    """Return clinic_staff user that belongs to this clinic, or raise HTTPException."""
    target = db.query(User).filter(User.id == staff_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role != UserRole.CLINIC_STAFF:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account is not clinic staff",
        )
    if target.clinic_id != clinic.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This staff member is not in your clinic",
        )
    return target


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
    
    # Update fields (license_number is the canonical value; staff/patients use clinic_id — changing
    # license only affects public registration and display, not existing memberships.)
    update_data = clinic_update.dict(exclude_unset=True)
    if "license_number" in update_data:
        new_lic = update_data["license_number"]
        taken = (
            db.query(Clinic)
            .filter(
                Clinic.license_number == new_lic,
                Clinic.id != clinic.id,
            )
            .first()
        )
        if taken:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This license number is already in use by another clinic",
            )

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

    total_staff = (
        db.query(User)
        .filter(
            User.clinic_id == clinic.id,
            User.role == UserRole.CLINIC_STAFF,
            User.is_active == True,
        )
        .count()
    )

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
        total_staff=total_staff,
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
    
    return [user_response_from_user(user) for user in users]


@router.get("/staff-members", response_model=List[UserResponse])
async def get_clinic_staff_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_admin),
):
    """List clinic staff (excludes clinic admin) for the administrator's clinic."""
    clinic = get_user_clinic(current_user, db)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    staff = (
        db.query(User)
        .filter(
            User.clinic_id == clinic.id,
            User.role == UserRole.CLINIC_STAFF,
            User.is_active == True,
        )
        .order_by(User.created_at.desc())
        .all()
    )
    return [user_response_from_user(u) for u in staff]


@router.post("/staff", response_model=UserResponse)
async def register_clinic_staff_by_admin(
    body: ClinicStaffRegisterRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_admin),
):
    """
    Clinic admin registers a staff member: ties them to the clinic when clinic_license
    matches this clinic's license. Sends temporary password to the staff email.
    """
    clinic = get_user_clinic(current_user, db)
    if not clinic or not clinic.is_active:
        raise HTTPException(status_code=404, detail="Clinic not found or inactive")

    if body.clinic_license.strip() != (clinic.license_number or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Clinic license number does not match your clinic. Enter your clinic's license to confirm.",
        )

    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email is already registered",
        )

    generated_password = generate_secure_password()
    new_user = User(
        email=body.email,
        hashed_password=get_password_hash(generated_password),
        first_name=body.first_name,
        last_name=body.last_name,
        role=UserRole.CLINIC_STAFF,
        clinic_id=clinic.id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    background_tasks.add_task(
        send_clinic_staff_welcome_email,
        to_email=body.email,
        first_name=body.first_name,
        password=generated_password,
        clinic_name=clinic.name,
    )

    return user_response_from_user(new_user)


@router.put("/staff/{staff_user_id}", response_model=UserResponse)
async def update_clinic_staff_by_admin(
    staff_user_id: int,
    body: ClinicStaffUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_admin),
):
    """Clinic admin updates a staff member's name and email."""
    clinic = get_user_clinic(current_user, db)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    target = _get_editable_clinic_staff(staff_user_id, clinic, db)
    if not target.is_active:
        raise HTTPException(status_code=400, detail="This staff account is inactive")

    new_email = str(body.email).strip()
    if new_email != target.email:
        taken = db.query(User).filter(User.email == new_email, User.id != target.id).first()
        if taken:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This email is already in use",
            )
        target.email = new_email

    target.first_name = body.first_name
    target.last_name = body.last_name
    db.commit()
    db.refresh(target)
    return user_response_from_user(target)


@router.delete("/staff/{staff_user_id}")
async def delete_clinic_staff_by_admin(
    staff_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_admin),
):
    """Deactivate a clinic staff account (they can no longer sign in)."""
    clinic = get_user_clinic(current_user, db)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    target = _get_editable_clinic_staff(staff_user_id, clinic, db)
    target.is_active = False
    db.commit()
    return {"message": "Staff member removed from the clinic"}


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
    
    # Recent document uploads by clinic staff only (not patient personal uploads)
    recent_documents = db.query(Document).filter(
        Document.clinic_id == clinic_id,
        Document.is_patient_upload == False
    ).order_by(Document.upload_date.desc()).limit(5).all()
    
    for doc in recent_documents:
        activities.append({
            "type": "document_uploaded",
            "title": f"Document uploaded: {doc.original_filename}",
            "timestamp": doc.upload_date,
            "icon": "document",
            "color": "blue"
        })
    
    # Documents shared by patients with this clinic
    shared_documents = db.query(Document).filter(
        Document.clinic_id == clinic_id,
        Document.is_patient_upload == True
    ).order_by(Document.upload_date.desc()).limit(5).all()
    
    for doc in shared_documents:
        patient = db.query(Patient).filter(Patient.id == doc.patient_id).first()
        patient_label = patient.patient_id if patient else "A patient"
        activities.append({
            "type": "document_shared",
            "title": f"{patient_label} shared: {doc.original_filename}",
            "timestamp": doc.upload_date,
            "icon": "share",
            "color": "teal"
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