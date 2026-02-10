from datetime import datetime, timedelta, timezone
import os
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.patient import Patient
from ..models.document import Document
from ..models.share_link import MedicalRecordShareLink
from ..models.user import User, UserRole
from ..schemas.document import (
    PublicSharedDocument,
    PublicShareLinkResponse,
    ShareLinkCreateResponse,
)
from ..utils.deps import get_current_active_user


router = APIRouter(prefix="/share", tags=["share"])


def _get_uploads_base() -> Path:
    """Return the absolute uploads base directory, matching main.py."""
    # share.py lives at backend/app/routers/share.py
    # We want backend/uploads (same as main.py which uses backend/app/main.py -> parent.parent = backend)
    backend_dir = Path(__file__).resolve().parents[2]
    return backend_dir / "uploads"


@router.post("/generate", response_model=ShareLinkCreateResponse)
async def generate_share_link_for_patient(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Generate a 24-hour public share link for the current patient's medical documents.

    The response includes a token and expiry; the frontend is responsible for
    constructing the full URL (e.g. `${window.location.origin}/share/${token}`).
    """
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can generate share links")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    # 24-hour expiry from now (UTC, timezone-aware)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    # Create random, unguessable token
    token = secrets.token_urlsafe(32)

    share_link = MedicalRecordShareLink(
        patient_id=patient.id,
        token=token,
        expires_at=expires_at,
    )

    db.add(share_link)
    db.commit()
    db.refresh(share_link)

    return ShareLinkCreateResponse(token=share_link.token, expires_at=share_link.expires_at)


@router.get("/{token}", response_model=PublicShareLinkResponse)
async def get_shared_medical_records(
    token: str,
    db: Session = Depends(get_db),
):
    """
    Public endpoint to view a patient's medical documents via a share token.

    No authentication required; access is controlled purely by the random token
    and its expiry time.
    """
    link = (
        db.query(MedicalRecordShareLink)
        .filter(MedicalRecordShareLink.token == token)
        .first()
    )
    if not link or link.revoked:
        raise HTTPException(status_code=404, detail="Share link not found or revoked")

    # Check expiry (UTC). Normalize tz handling to avoid naive/aware comparisons.
    now = datetime.now(timezone.utc)
    expires_at = link.expires_at
    if expires_at is None:
        raise HTTPException(status_code=404, detail="Share link has expired")
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        raise HTTPException(status_code=404, detail="Share link has expired")

    patient = db.query(Patient).filter(Patient.id == link.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Load all documents for this patient
    documents = (
        db.query(Document)
        .filter(Document.patient_id == patient.id)
        .order_by(Document.upload_date.desc())
        .all()
    )

    uploads_base = _get_uploads_base()
    documents_public: list[PublicSharedDocument] = []

    for doc in documents:
        # Derive URL path under /uploads from absolute file_path
        try:
            rel_path = os.path.relpath(doc.file_path, uploads_base)
        except ValueError:
            # If relpath fails for any reason, skip this document rather than leaking paths
            continue

        # Prevent path traversal / escaping the uploads directory
        if os.path.isabs(rel_path) or rel_path.startswith(".."):
            continue

        file_url = f"/uploads/{rel_path.replace(os.path.sep, '/')}"

        documents_public.append(
            PublicSharedDocument(
                id=doc.id,
                original_filename=doc.original_filename,
                document_type=doc.document_type,
                upload_date=doc.upload_date,
                file_size=doc.file_size or 0,
                file_url=file_url,
            )
        )

    # Increment simple view counter
    link.view_count += 1
    db.commit()

    return PublicShareLinkResponse(
        patient_id=patient.id,
        patient_identifier=patient.patient_id,
        patient_first_name=patient.user.first_name if patient.user else None,
        patient_last_name=patient.user.last_name if patient.user else None,
        expires_at=link.expires_at,
        documents=documents_public,
    )

