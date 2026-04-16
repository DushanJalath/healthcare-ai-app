from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional

from ..database import get_db
from ..models.medical_history import MedicalHistoryEntry, MedicalEntryStatus
from ..models.patient import Patient
from ..models.patient_clinic import PatientClinic
from ..models.clinic import Clinic
from ..models.user import User, UserRole
from ..models.notification import Notification, NotificationType
from ..schemas.medical_history import (
    MedicalHistoryEntryCreate,
    MedicalHistoryEntryUpdate,
    MedicalHistoryEntryResponse,
    MedicalHistoryListResponse,
)
from ..utils.deps import get_current_active_user, require_clinic_access

router = APIRouter(prefix="/medical-history", tags=["medical-history"])


def _entry_to_response(entry: MedicalHistoryEntry) -> MedicalHistoryEntryResponse:
    creator_name = None
    if entry.creator:
        parts = [entry.creator.first_name, entry.creator.last_name]
        creator_name = " ".join(p for p in parts if p) or entry.creator.email
    return MedicalHistoryEntryResponse(
        id=entry.id,
        patient_id=entry.patient_id,
        title=entry.title,
        condition=entry.condition,
        description=entry.description,
        medications=entry.medications,
        treating_doctor=entry.treating_doctor,
        clinic_id=entry.clinic_id,
        clinic_name=entry.clinic_name,
        start_date=entry.start_date,
        end_date=entry.end_date,
        status=entry.status,
        created_by=entry.created_by,
        created_by_name=creator_name,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


# ---------------------------------------------------------------------------
# Patient-facing endpoints
# ---------------------------------------------------------------------------

@router.get("/my", response_model=MedicalHistoryListResponse)
async def get_my_medical_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Patient views their own medical history entries (newest first)."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can access this endpoint")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    entries = (
        db.query(MedicalHistoryEntry)
        .filter(MedicalHistoryEntry.patient_id == patient.id)
        .order_by(desc(MedicalHistoryEntry.start_date))
        .all()
    )
    return MedicalHistoryListResponse(
        entries=[_entry_to_response(e) for e in entries],
        total=len(entries),
    )


@router.post("/my", response_model=MedicalHistoryEntryResponse, status_code=201)
async def create_my_medical_history_entry(
    payload: MedicalHistoryEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Patient adds an entry to their own medical history."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can access this endpoint")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    entry = MedicalHistoryEntry(
        patient_id=patient.id,
        title=payload.title,
        condition=payload.condition,
        description=payload.description,
        medications=payload.medications,
        treating_doctor=payload.treating_doctor,
        clinic_name=payload.clinic_name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
        created_by=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _entry_to_response(entry)


@router.put("/my/{entry_id}", response_model=MedicalHistoryEntryResponse)
async def update_my_medical_history_entry(
    entry_id: int,
    payload: MedicalHistoryEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Patient edits one of their own medical history entries."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can access this endpoint")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    entry = (
        db.query(MedicalHistoryEntry)
        .filter(MedicalHistoryEntry.id == entry_id, MedicalHistoryEntry.patient_id == patient.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Medical history entry not found")

    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(entry, field, value)

    db.commit()
    db.refresh(entry)
    return _entry_to_response(entry)


@router.delete("/my/{entry_id}", status_code=204)
async def delete_my_medical_history_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Patient deletes one of their own medical history entries."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can access this endpoint")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    entry = (
        db.query(MedicalHistoryEntry)
        .filter(MedicalHistoryEntry.id == entry_id, MedicalHistoryEntry.patient_id == patient.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Medical history entry not found")

    db.delete(entry)
    db.commit()


# ---------------------------------------------------------------------------
# Clinic-staff-facing endpoints
# ---------------------------------------------------------------------------

@router.get("/patient/{patient_id}", response_model=MedicalHistoryListResponse)
async def get_patient_medical_history(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access),
):
    """Clinic staff views a patient's medical history."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if current_user.role not in (UserRole.ADMIN,):
        clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
        clinic_id = clinic.id if clinic else None
        if clinic_id:
            membership = db.query(PatientClinic).filter(
                PatientClinic.patient_id == patient.id,
                PatientClinic.clinic_id == clinic_id,
                PatientClinic.is_active == True,
            ).first()
            if not membership:
                raise HTTPException(status_code=403, detail="Patient is not enrolled in your clinic")

    entries = (
        db.query(MedicalHistoryEntry)
        .filter(MedicalHistoryEntry.patient_id == patient.id)
        .order_by(desc(MedicalHistoryEntry.start_date))
        .all()
    )
    return MedicalHistoryListResponse(
        entries=[_entry_to_response(e) for e in entries],
        total=len(entries),
    )


@router.post("/patient/{patient_id}", response_model=MedicalHistoryEntryResponse, status_code=201)
async def create_patient_medical_history_entry(
    patient_id: int,
    payload: MedicalHistoryEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access),
):
    """Clinic staff adds a medical history entry for a patient."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
    clinic_id = clinic.id if clinic else None
    resolved_clinic_name = payload.clinic_name

    if clinic_id:
        membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient.id,
            PatientClinic.clinic_id == clinic_id,
            PatientClinic.is_active == True,
        ).first()
        if not membership and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Patient is not enrolled in your clinic")
        if not resolved_clinic_name:
            resolved_clinic_name = clinic.name

    entry = MedicalHistoryEntry(
        patient_id=patient.id,
        title=payload.title,
        condition=payload.condition,
        description=payload.description,
        medications=payload.medications,
        treating_doctor=payload.treating_doctor,
        clinic_id=clinic_id,
        clinic_name=resolved_clinic_name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
        created_by=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    # Notify the patient
    if patient.user_id:
        staff_name = f"{current_user.first_name} {current_user.last_name}"
        clinic_label = resolved_clinic_name or "your clinic"
        notification = Notification(
            user_id=patient.user_id,
            title="New Medical History Entry",
            message=f"{staff_name} from {clinic_label} added a medical history entry: \"{payload.title}\".",
            notification_type=NotificationType.GENERAL,
            related_entity_type="medical_history",
            related_entity_id=entry.id,
        )
        db.add(notification)
        db.commit()

    return _entry_to_response(entry)


@router.put("/patient/{patient_id}/entry/{entry_id}", response_model=MedicalHistoryEntryResponse)
async def update_patient_medical_history_entry(
    patient_id: int,
    entry_id: int,
    payload: MedicalHistoryEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access),
):
    """Clinic staff updates a medical history entry for a patient."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
    clinic_id = clinic.id if clinic else None

    if clinic_id:
        membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient.id,
            PatientClinic.clinic_id == clinic_id,
            PatientClinic.is_active == True,
        ).first()
        if not membership and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Patient is not enrolled in your clinic")

    entry = (
        db.query(MedicalHistoryEntry)
        .filter(
            MedicalHistoryEntry.id == entry_id,
            MedicalHistoryEntry.patient_id == patient.id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Medical history entry not found")

    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(entry, field, value)

    db.commit()
    db.refresh(entry)
    return _entry_to_response(entry)


@router.delete("/patient/{patient_id}/entry/{entry_id}", status_code=204)
async def delete_patient_medical_history_entry(
    patient_id: int,
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access),
):
    """Clinic staff deletes a medical history entry for a patient."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
    clinic_id = clinic.id if clinic else None

    if clinic_id:
        membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient.id,
            PatientClinic.clinic_id == clinic_id,
            PatientClinic.is_active == True,
        ).first()
        if not membership and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Patient is not enrolled in your clinic")

    entry = (
        db.query(MedicalHistoryEntry)
        .filter(
            MedicalHistoryEntry.id == entry_id,
            MedicalHistoryEntry.patient_id == patient.id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Medical history entry not found")

    db.delete(entry)
    db.commit()
