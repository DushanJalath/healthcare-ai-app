from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from typing import Optional
from datetime import date
from pydantic import BaseModel, validator

from ..database import get_db
from ..models.clinic import Clinic
from ..models.patient import Patient, Gender
from ..models.patient_clinic import PatientClinic
from ..models.user import User, UserRole
from ..models.notification import Notification, NotificationType
from ..schemas.clinic import ClinicResponse
from ..utils.deps import get_current_active_user, require_patient

router = APIRouter(prefix="/clinic-enrollment", tags=["clinic-enrollment"])


class ClinicListItem(BaseModel):
    id: int
    name: str
    clinic_type: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_enrolled: bool = False

    class Config:
        from_attributes = True


class ClinicListResponse(BaseModel):
    clinics: list[ClinicListItem]
    total: int


class EnrollRequest(BaseModel):
    date_of_birth: date
    gender: Gender
    phone: str
    address: str
    emergency_contact_name: str
    emergency_contact_phone: str
    medical_history: Optional[str] = None
    allergies: Optional[str] = None
    current_medications: Optional[str] = None
    notes: Optional[str] = None

    @validator("phone", "emergency_contact_phone")
    def validate_phone(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Phone number is required")
        return v

    @validator("address", "emergency_contact_name")
    def validate_required_str(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("This field is required")
        return v


class EnrollResponse(BaseModel):
    message: str
    clinic_id: int
    clinic_name: str


@router.get("/clinics", response_model=ClinicListResponse)
async def list_all_clinics(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_patient),
):
    """List all active clinics. Patient can see which ones they're already enrolled in."""
    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    query = db.query(Clinic).filter(Clinic.is_active == True)
    if search:
        query = query.filter(Clinic.name.ilike(f"%{search}%"))
    query = query.order_by(Clinic.name)
    clinics = query.all()

    enrolled_clinic_ids = set()
    memberships = (
        db.query(PatientClinic.clinic_id)
        .filter(PatientClinic.patient_id == patient.id, PatientClinic.is_active == True)
        .all()
    )
    enrolled_clinic_ids = {m.clinic_id for m in memberships}

    items = []
    for c in clinics:
        items.append(
            ClinicListItem(
                id=c.id,
                name=c.name,
                clinic_type=c.clinic_type.value if c.clinic_type else None,
                address=c.address,
                phone=c.phone,
                email=c.email,
                is_enrolled=c.id in enrolled_clinic_ids,
            )
        )

    return ClinicListResponse(clinics=items, total=len(items))


@router.post("/clinics/{clinic_id}/enroll", response_model=EnrollResponse)
async def enroll_in_clinic(
    clinic_id: int,
    body: EnrollRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_patient),
):
    """Patient enrolls in a clinic. Updates patient profile and creates PatientClinic row."""
    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    clinic = db.query(Clinic).filter(Clinic.id == clinic_id, Clinic.is_active == True).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found or inactive")

    # Update patient profile with the provided details
    patient.date_of_birth = body.date_of_birth
    patient.gender = body.gender
    patient.phone = body.phone
    patient.address = body.address
    patient.emergency_contact_name = body.emergency_contact_name
    patient.emergency_contact_phone = body.emergency_contact_phone
    if body.medical_history is not None:
        patient.medical_history = body.medical_history
    if body.allergies is not None:
        patient.allergies = body.allergies
    if body.current_medications is not None:
        patient.current_medications = body.current_medications

    existing = (
        db.query(PatientClinic)
        .filter(PatientClinic.patient_id == patient.id, PatientClinic.clinic_id == clinic.id)
        .first()
    )
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=400, detail="You are already enrolled in this clinic")
        existing.is_active = True
        existing.notes = body.notes
    else:
        membership = PatientClinic(
            patient_id=patient.id,
            clinic_id=clinic.id,
            is_active=True,
            notes=body.notes,
        )
        db.add(membership)

    patient_name = f"{current_user.first_name} {current_user.last_name}"

    # Notify all clinic staff: admin + clinic_admin + clinic_staff
    notify_user_ids: set[int] = set()
    if clinic.admin_user_id:
        notify_user_ids.add(clinic.admin_user_id)
    clinic_members = (
        db.query(User)
        .filter(
            User.clinic_id == clinic.id,
            User.role.in_([UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]),
            User.is_active == True,
        )
        .all()
    )
    for member in clinic_members:
        notify_user_ids.add(member.id)

    for user_id in notify_user_ids:
        notification = Notification(
            user_id=user_id,
            title="New Patient Enrollment",
            message=f"{patient_name} has enrolled in your clinic.",
            notification_type=NotificationType.PATIENT_ENROLLED,
            related_entity_type="patient",
            related_entity_id=patient.id,
        )
        db.add(notification)

    db.commit()

    return EnrollResponse(
        message=f"Successfully enrolled in {clinic.name}",
        clinic_id=clinic.id,
        clinic_name=clinic.name,
    )


@router.post("/clinics/{clinic_id}/unenroll")
async def unenroll_from_clinic(
    clinic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_patient),
):
    """Patient unenrolls from a clinic."""
    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    membership = (
        db.query(PatientClinic)
        .filter(
            PatientClinic.patient_id == patient.id,
            PatientClinic.clinic_id == clinic_id,
            PatientClinic.is_active == True,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="You are not enrolled in this clinic")

    membership.is_active = False

    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    patient_name = f"{current_user.first_name} {current_user.last_name}"

    if clinic:
        notify_user_ids: set[int] = set()
        if clinic.admin_user_id:
            notify_user_ids.add(clinic.admin_user_id)
        clinic_members = (
            db.query(User)
            .filter(
                User.clinic_id == clinic.id,
                User.role.in_([UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]),
                User.is_active == True,
            )
            .all()
        )
        for member in clinic_members:
            notify_user_ids.add(member.id)

        for user_id in notify_user_ids:
            notification = Notification(
                user_id=user_id,
                title="Patient Unenrolled",
                message=f"{patient_name} has left your clinic.",
                notification_type=NotificationType.PATIENT_UNENROLLED,
                related_entity_type="patient",
                related_entity_id=patient.id,
            )
            db.add(notification)

    db.commit()
    return {"message": "Successfully unenrolled from clinic"}
