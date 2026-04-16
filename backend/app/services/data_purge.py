"""
Centralized deletion of patient and clinic-staff related rows and files.
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from ..models.audit_log import AuditLog
from ..models.document import Document
from ..models.extraction import Extraction
from ..models.medical_history import MedicalHistoryEntry
from ..models.notification import Notification
from ..models.patient import Patient
from ..models.patient_clinic import PatientClinic
from ..models.patient_document_condition import PatientDocumentCondition
from ..models.share_link import MedicalRecordShareLink
from ..models.user import User, UserRole
from ..utils.file_handler import delete_file
from .vector_indexing import delete_patient_vector_data

logger = logging.getLogger(__name__)


def purge_patient_data(
    db: Session,
    patient: Patient,
    *,
    delete_linked_user: bool = False,
) -> None:
    """
    Remove all application data for this patient (documents on disk, vectors,
    memberships, history, audit rows for this patient, then the patient row).

    If delete_linked_user is True and the patient has a linked PATIENT user,
    that user row is removed after clearing user-scoped rows (notifications,
    audit logs for that user).
    """
    pid = patient.id
    linked_user_id: Optional[int] = patient.user_id

    try:
        delete_patient_vector_data(pid)
    except Exception as e:
        logger.warning("Vector purge for patient %s: %s", pid, e)

    db.query(AuditLog).filter(AuditLog.patient_id == pid).delete(synchronize_session=False)
    db.query(MedicalRecordShareLink).filter(MedicalRecordShareLink.patient_id == pid).delete(
        synchronize_session=False
    )
    db.query(PatientClinic).filter(PatientClinic.patient_id == pid).delete(synchronize_session=False)
    db.query(MedicalHistoryEntry).filter(MedicalHistoryEntry.patient_id == pid).delete(
        synchronize_session=False
    )
    db.query(PatientDocumentCondition).filter(PatientDocumentCondition.patient_id == pid).delete(
        synchronize_session=False
    )

    docs = (
        db.query(Document)
        .options(joinedload(Document.extractions), joinedload(Document.chunks))
        .filter(Document.patient_id == pid)
        .all()
    )
    for doc in docs:
        if doc.file_path:
            delete_file(doc.file_path)
        for ext in list(doc.extractions):
            db.delete(ext)
        for chunk in list(doc.chunks):
            db.delete(chunk)
        db.delete(doc)

    db.query(Extraction).filter(Extraction.patient_id == pid).delete(synchronize_session=False)

    db.delete(patient)

    if delete_linked_user and linked_user_id:
        u = db.query(User).filter(User.id == linked_user_id).first()
        if u and u.role == UserRole.PATIENT:
            db.query(AuditLog).filter(AuditLog.user_id == u.id).delete(synchronize_session=False)
            db.query(Notification).filter(Notification.user_id == u.id).delete(synchronize_session=False)
            db.delete(u)


def purge_clinic_staff_user(
    db: Session,
    staff: User,
    *,
    reassign_medical_history_creator_id: int,
) -> None:
    """
    Permanently remove a clinic staff user. Patient-owned data they uploaded or
    authored remains: document uploader is nulled; medical history rows they
    created keep `created_by` reassigned to the given user (typically clinic admin).
    """
    if staff.role != UserRole.CLINIC_STAFF:
        raise ValueError("purge_clinic_staff_user expects a CLINIC_STAFF user")

    db.query(MedicalHistoryEntry).filter(MedicalHistoryEntry.created_by == staff.id).update(
        {MedicalHistoryEntry.created_by: reassign_medical_history_creator_id},
        synchronize_session=False,
    )
    db.query(Document).filter(Document.uploaded_by_user_id == staff.id).update(
        {Document.uploaded_by_user_id: None},
        synchronize_session=False,
    )
    db.query(AuditLog).filter(AuditLog.user_id == staff.id).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.user_id == staff.id).delete(synchronize_session=False)
    db.delete(staff)
