from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, status, Query, Request, UploadFile
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func, and_
from typing import List, Optional, cast
from datetime import datetime, timedelta
from pydantic import BaseModel

from ..database import get_db
from ..models.patient import Patient
from ..models.patient_clinic import PatientClinic
from ..models.clinic import Clinic
from ..models.document import Document, DocumentStatus, DocumentType
from ..models.extraction import Extraction, ExtractionStatus, ExtractionType
from ..models.user import User, UserRole
from ..models.notification import Notification, NotificationType
from ..schemas.patient import PatientDetailResponse
from ..schemas.document import DocumentResponse, DocumentUploadResponse
from ..utils.deps import get_current_active_user
from ..utils.file_handler import save_upload_file
from ..utils.audit import get_audit_logger, AuditAction, AuditEntityType
from ..utils.phone import is_placeholder_login_email
from ..services.health_trends_from_extractions import (
    MetricKey,
    build_monthly_points,
    collect_document_metric_readings,
)

router = APIRouter(prefix="/patient-dashboard", tags=["patient-dashboard"])

class PatientDashboardStats(BaseModel):
    total_documents: int
    recent_documents: int
    processed_documents: int
    pending_documents: int
    storage_used: int
    last_upload: Optional[datetime]
    document_types: dict

class PatientDashboardResponse(BaseModel):
    patient_profile: PatientDetailResponse
    stats: PatientDashboardStats
    recent_documents: List[DocumentResponse]
    timeline_events: List[dict]


class HealthTrendPoint(BaseModel):
    label: str
    value: float
    month_key: str


class HealthTrendsResponse(BaseModel):
    metric: str
    unit: str
    points: List[HealthTrendPoint]
    latest_value: Optional[float] = None
    has_data: bool
    source: str = "document_extractions"


@router.get("/", response_model=PatientDashboardResponse)
async def get_patient_dashboard(
    request: Request,
    clinic_id: Optional[int] = Query(None, description="Filter dashboard data by clinic ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get patient dashboard data. Optionally filter by clinic_id."""
    
    # Ensure user is a patient or find their patient record
    patient = None
    if current_user.role == UserRole.PATIENT:
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient profile not found")
    else:
        raise HTTPException(status_code=403, detail="Access denied - patients only")
    
    # Validate clinic_id if provided
    if clinic_id:
        # Check if patient is enrolled in this clinic
        membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient.id,
            PatientClinic.clinic_id == clinic_id,
            PatientClinic.is_active == True
        ).first()
        if not membership:
            raise HTTPException(
                status_code=403, 
                detail=f"Patient is not enrolled in clinic {clinic_id}"
            )
    
    # Log dashboard access
    audit_logger = get_audit_logger(db)
    audit_logger.log_patient_action(
        action=AuditAction.VIEW,
        user=current_user,
        patient_id=patient.id,
        patient_name=patient.patient_id,
        description=f"Accessed patient dashboard" + (f" (clinic {clinic_id})" if clinic_id else ""),
        request=request
    )
    
    # Get patient documents - filter by clinic if specified
    # Build base query once
    base_doc_filter = Document.patient_id == patient.id
    if clinic_id:
        base_doc_filter = and_(base_doc_filter, Document.clinic_id == clinic_id)
    
    documents_query = db.query(Document).filter(base_doc_filter)
    
    # Optimize: Get all stats in fewer queries
    week_ago = datetime.now() - timedelta(days=7)
    
    # Get counts in a single aggregated query where possible
    # Total documents
    total_documents = documents_query.count()
    
    # Recent documents (last 7 days)
    recent_documents = documents_query.filter(Document.upload_date >= week_ago).count()
    
    # Processed documents
    processed_documents = documents_query.filter(Document.status == DocumentStatus.PROCESSED).count()
    
    # Pending documents
    pending_documents = documents_query.filter(
        Document.status.in_([DocumentStatus.UPLOADED, DocumentStatus.PROCESSING])
    ).count()
    
    # Storage used - reuse the same filter
    storage_used = db.query(func.sum(Document.file_size)).filter(
        base_doc_filter
    ).scalar() or 0
    
    # Last upload
    last_document = documents_query.order_by(desc(Document.upload_date)).first()
    last_upload = last_document.upload_date if last_document else None
    
    # Document types distribution - reuse filter
    doc_type_stats = db.query(
        Document.document_type,
        func.count(Document.id)
    ).filter(
        base_doc_filter
    ).group_by(Document.document_type).all()
    
    document_types = {doc_type.value: count for doc_type, count in doc_type_stats}
    
    # Recent documents (last 10)
    recent_docs = documents_query.options(
        joinedload(Document.extractions)
    ).order_by(desc(Document.upload_date)).limit(10).all()
    
    # Timeline events - filter by clinic if specified
    timeline_events = _build_patient_timeline(patient.id, db, clinic_id=clinic_id)
    
    # Build patient profile
    patient_profile = _build_patient_detail(patient, db)
    
    stats = PatientDashboardStats(
        total_documents=total_documents,
        recent_documents=recent_documents,
        processed_documents=processed_documents,
        pending_documents=pending_documents,
        storage_used=storage_used,
        last_upload=last_upload,
        document_types=document_types
    )
    
    return PatientDashboardResponse(
        patient_profile=patient_profile,
        stats=stats,
        recent_documents=[DocumentResponse.from_orm(doc) for doc in recent_docs],
        timeline_events=timeline_events
    )

@router.get("/documents", response_model=List[DocumentResponse])
async def get_patient_documents(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    status: Optional[DocumentStatus] = None,
    document_type: Optional[DocumentType] = None,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get patient's documents with filtering."""
    
    # Get patient
    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    
    # Log document access
    audit_logger = get_audit_logger(db)
    audit_logger.log_patient_action(
        action=AuditAction.VIEW,
        user=current_user,
        patient_id=patient.id,
        patient_name=patient.patient_id,
        description="Viewed patient documents list",
        request=request,
        extra_metadata={"page": page, "per_page": per_page, "status": status, "type": document_type}
    )
    
    # Build query
    query = db.query(Document).filter(Document.patient_id == patient.id)
    
    if status:
        query = query.filter(Document.status == status)
    if document_type:
        query = query.filter(Document.document_type == document_type)
    
    # Apply pagination
    offset = (page - 1) * per_page
    documents = query.order_by(desc(Document.upload_date)).offset(offset).limit(per_page).all()
    
    return [DocumentResponse.from_orm(doc) for doc in documents]

@router.get("/timeline")
async def get_patient_timeline(
    days: int = Query(30, ge=7, le=365),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get patient's medical timeline."""
    
    # Get patient
    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    
    # Log timeline access
    audit_logger = get_audit_logger(db)
    audit_logger.log_patient_action(
        action=AuditAction.VIEW,
        user=current_user,
        patient_id=patient.id,
        patient_name=patient.patient_id,
        description="Viewed patient timeline",
        request=request,
        extra_metadata={"days": days}
    )
    
    timeline_events = _build_patient_timeline(patient.id, db, days)
    
    return {"timeline_events": timeline_events}

@router.get("/stats")
async def get_patient_stats(
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get detailed patient statistics."""
    
    # Get patient
    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    
    # Build comprehensive stats
    documents_query = db.query(Document).filter(Document.patient_id == patient.id)
    
    # Monthly document counts (last 12 months)
    monthly_stats = []
    for i in range(12):
        month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_start = month_start - timedelta(days=30 * i)
        month_end = month_start + timedelta(days=30)
        
        count = documents_query.filter(
            Document.upload_date >= month_start,
            Document.upload_date < month_end
        ).count()
        
        monthly_stats.append({
            "month": month_start.strftime("%Y-%m"),
            "count": count
        })
    
    # Document processing success rate
    total_docs = documents_query.count()
    processed_docs = documents_query.filter(Document.status == DocumentStatus.PROCESSED).count()
    failed_docs = documents_query.filter(Document.status == DocumentStatus.FAILED).count()
    
    success_rate = (processed_docs / total_docs * 100) if total_docs > 0 else 0
    
    return {
        "monthly_documents": monthly_stats,
        "processing_success_rate": round(success_rate, 1),
        "total_documents": total_docs,
        "processed_documents": processed_docs,
        "failed_documents": failed_docs
    }


@router.get("/health-trends", response_model=HealthTrendsResponse)
async def get_patient_health_trends(
    metric: str = Query(
        "glucose",
        description="One of: glucose, cholesterol, bp_systolic, heart_rate, weight",
    ),
    months: int = Query(6, ge=1, le=24),
    clinic_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Time series for the premium health chart, derived from processed document OCR text.
    Values are parsed from uploaded records (labs, vitals sections, etc.), not manually entered vitals.
    Each processed document contributes at most one point per metric; multiple uploads in the same
    month all appear when their reference timestamps fall in the requested rolling window.
    """
    allowed = {"glucose", "cholesterol", "bp_systolic", "heart_rate", "weight"}
    if metric not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid metric. Allowed: {', '.join(sorted(allowed))}")

    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Access denied - patients only")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    if clinic_id is not None:
        membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient.id,
            PatientClinic.clinic_id == clinic_id,
            PatientClinic.is_active == True,
        ).first()
        if not membership:
            raise HTTPException(
                status_code=403,
                detail=f"Patient is not enrolled in clinic {clinic_id}",
            )

    mkey = cast(MetricKey, metric)
    readings = collect_document_metric_readings(
        db,
        patient_id=patient.id,
        metric=mkey,
        clinic_id=clinic_id,
    )
    points_raw, latest, weight_unit = build_monthly_points(
        readings,
        num_months=months,
        metric=mkey,
    )

    if metric == "glucose":
        unit = "mg/dL"
    elif metric == "cholesterol":
        unit = "mg/dL"
    elif metric == "bp_systolic":
        unit = "mmHg"
    elif metric == "heart_rate":
        unit = "bpm"
    elif metric == "weight":
        unit = "kg" if weight_unit == "kg" else "lb"
    else:
        unit = "lb"

    return HealthTrendsResponse(
        metric=metric,
        unit=unit,
        points=[HealthTrendPoint(**p) for p in points_raw],
        latest_value=latest,
        has_data=bool(points_raw),
    )


@router.get("/medical-records")
async def get_patient_medical_records(
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Return unified medical records for the patient: profile medical info,
    document breakdown by type, and all documents with their OCR-extracted text.
    """
    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    audit_logger = get_audit_logger(db)
    audit_logger.log_patient_action(
        action=AuditAction.VIEW,
        user=current_user,
        patient_id=patient.id,
        patient_name=patient.patient_id,
        description="Viewed unified medical records",
        request=request,
    )

    documents = (
        db.query(Document)
        .filter(Document.patient_id == patient.id)
        .options(joinedload(Document.extractions))
        .order_by(desc(Document.upload_date))
        .all()
    )

    records_by_type: dict = {}
    for doc in documents:
        doc_type = doc.document_type.value if doc.document_type else "other"
        if doc_type not in records_by_type:
            records_by_type[doc_type] = []

        extracted_text = None
        extraction_date = None
        if doc.extractions:
            completed = [e for e in doc.extractions if e.status == ExtractionStatus.COMPLETED and e.raw_text]
            if completed:
                latest = max(completed, key=lambda e: e.completed_at or e.created_at)
                extracted_text = latest.raw_text
                extraction_date = latest.completed_at

        records_by_type[doc_type].append({
            "id": doc.id,
            "original_filename": doc.original_filename,
            "document_type": doc_type,
            "upload_date": doc.upload_date,
            "status": doc.status.value,
            "file_size": doc.file_size,
            "extracted_text": extracted_text,
            "extraction_date": extraction_date,
            "clinic_id": doc.clinic_id,
        })

    return {
        "patient_id": patient.patient_id,
        "medical_history": patient.medical_history,
        "allergies": patient.allergies,
        "current_medications": patient.current_medications,
        "total_documents": len(documents),
        "records_by_type": records_by_type,
    }


@router.get("/medication-history")
async def get_patient_medication_history(
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Return the patient's medication history: current medications from the
    profile, plus all prescription-type documents with their extracted text.
    """
    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    audit_logger = get_audit_logger(db)
    audit_logger.log_patient_action(
        action=AuditAction.VIEW,
        user=current_user,
        patient_id=patient.id,
        patient_name=patient.patient_id,
        description="Viewed medication history",
        request=request,
    )

    prescriptions = (
        db.query(Document)
        .filter(
            Document.patient_id == patient.id,
            Document.document_type == DocumentType.PRESCRIPTION,
        )
        .options(joinedload(Document.extractions))
        .order_by(desc(Document.upload_date))
        .all()
    )

    prescription_records = []
    for doc in prescriptions:
        extracted_text = None
        extraction_date = None
        if doc.extractions:
            completed = [e for e in doc.extractions if e.status == ExtractionStatus.COMPLETED and e.raw_text]
            if completed:
                latest = max(completed, key=lambda e: e.completed_at or e.created_at)
                extracted_text = latest.raw_text
                extraction_date = latest.completed_at

        prescription_records.append({
            "id": doc.id,
            "original_filename": doc.original_filename,
            "upload_date": doc.upload_date,
            "status": doc.status.value,
            "file_size": doc.file_size,
            "extracted_text": extracted_text,
            "extraction_date": extraction_date,
            "clinic_id": doc.clinic_id,
        })

    return {
        "current_medications": patient.current_medications,
        "allergies": patient.allergies,
        "total_prescriptions": len(prescription_records),
        "prescriptions": prescription_records,
    }


def _build_patient_timeline(patient_id: int, db: Session, days: int = 30, clinic_id: Optional[int] = None) -> List[dict]:
    """Build patient timeline events. Optionally filter by clinic_id."""
    
    since_date = datetime.now() - timedelta(days=days)
    
    timeline = []
    
    # Document uploads
    documents_query = db.query(Document).filter(
        Document.patient_id == patient_id,
        Document.upload_date >= since_date
    )
    if clinic_id:
        documents_query = documents_query.filter(Document.clinic_id == clinic_id)
    documents = documents_query.order_by(desc(Document.upload_date)).all()
    
    for doc in documents:
        timeline.append({
            "date": doc.upload_date,
            "type": "document_upload",
            "title": f"Document Uploaded: {doc.original_filename}",
            "description": f"{doc.document_type.value.replace('_', ' ').title()} uploaded",
            "icon": "document",
            "color": "blue",
            "metadata": {
                "document_id": doc.id,
                "filename": doc.original_filename,
                "type": doc.document_type.value,
                "status": doc.status.value
            }
        })
        
        # Add processing completion events
        if doc.processed_date:
            timeline.append({
                "date": doc.processed_date,
                "type": "document_processed",
                "title": f"Document Processed: {doc.original_filename}",
                "description": "AI analysis completed",
                "icon": "check-circle",
                "color": "green",
                "metadata": {
                    "document_id": doc.id,
                    "filename": doc.original_filename
                }
            })
    
    # Sort timeline by date (newest first)
    timeline.sort(key=lambda x: x["date"], reverse=True)
    
    return timeline

def _build_patient_detail(patient: Patient, db: Session):
    """Build detailed patient response."""
    
    # Load clinic memberships to get all clinics
    memberships = db.query(PatientClinic).filter(
        PatientClinic.patient_id == patient.id,
        PatientClinic.is_active == True
    ).options(joinedload(PatientClinic.clinic)).all()
    
    # Get clinic IDs and names from memberships
    clinic_ids = [m.clinic_id for m in memberships]
    clinic_names = [m.clinic.name for m in memberships if m.clinic]
    
    # Get primary clinic (first active membership, or legacy clinic_id)
    primary_clinic = memberships[0].clinic if memberships else patient.clinic
    primary_clinic_name = primary_clinic.name if primary_clinic else None
    
    # Get documents count
    documents_count = db.query(Document).filter(Document.patient_id == patient.id).count()
    
    response_data = {
        "id": patient.id,
        "user_id": patient.user_id,
        "clinic_id": patient.clinic_id,  # Keep for backward compatibility
        "clinic_ids": clinic_ids,  # All clinic IDs from memberships
        "patient_id": patient.patient_id,
        "date_of_birth": patient.date_of_birth,
        "gender": patient.gender,
        "phone": patient.phone,
        "address": patient.address,
        "emergency_contact_name": patient.emergency_contact_name,
        "emergency_contact_phone": patient.emergency_contact_phone,
        "medical_history": patient.medical_history,
        "allergies": patient.allergies,
        "current_medications": patient.current_medications,
        "created_at": patient.created_at,
        "updated_at": patient.updated_at,
        "user_first_name": patient.user.first_name if patient.user else None,
        "user_last_name": patient.user.last_name if patient.user else None,
        "user_email": (
            None
            if (patient.user and is_placeholder_login_email(patient.user.email))
            else (patient.user.email if patient.user else None)
        ),
        "user_phone": patient.user.phone if patient.user else None,
        "clinic_name": primary_clinic_name,  # Primary clinic for backward compatibility
        "clinic_names": clinic_names,  # All clinic names from memberships
        "documents_count": documents_count,
        "last_visit": None  # This could be calculated based on latest document or appointment
    }
    
    return PatientDetailResponse(**response_data)


ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/bmp",
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/my-uploads", response_model=DocumentUploadResponse)
async def patient_upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    document_type: Optional[DocumentType] = Form(None),
    notes: Optional[str] = Form(None),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Allow patients to upload their own records. Documents are marked as patient-uploaded,
    run through OpenAI Vision OCR in the background, indexed for the patient AI assistant
    when extraction succeeds, and can be shared with clinics separately.
    """
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can use this endpoint")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: PDF, JPEG, PNG, TIFF, BMP",
        )

    try:
        file_path, unique_filename, file_size = await save_upload_file(file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds maximum allowed size of 50 MB")

    document = Document(
        patient_id=patient.id,
        clinic_id=None,
        filename=unique_filename,
        original_filename=file.filename or "unknown",
        file_path=file_path,
        file_size=file_size,
        mime_type=file.content_type or "application/octet-stream",
        document_type=document_type or DocumentType.OTHER,
        status=DocumentStatus.UPLOADED,
        notes=notes,
        is_patient_upload=True,
        uploaded_by_user_id=current_user.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    extraction = Extraction(
        document_id=document.id,
        patient_id=patient.id,
        extraction_type=ExtractionType.GENERAL,
        status=ExtractionStatus.PENDING,
        extraction_method="OPENAI_OCR",
    )
    db.add(extraction)
    document.status = DocumentStatus.PROCESSING
    db.commit()
    db.refresh(extraction)

    from ..services.document_processing import process_document_ocr
    background_tasks.add_task(
        process_document_ocr, document.id, extraction.id, use_openai=True
    )

    audit_logger = get_audit_logger(db)
    audit_logger.log_patient_action(
        action=AuditAction.UPLOAD,
        user=current_user,
        patient_id=patient.id,
        patient_name=patient.patient_id,
        description=f"Patient uploaded document: {document.original_filename}",
        request=request,
        extra_metadata={"document_id": document.id, "document_type": str(document.document_type)},
    )

    return DocumentUploadResponse(
        message="Document uploaded successfully",
        document=DocumentResponse.from_orm(document),
        processing_started=True,
    )


@router.delete("/my-uploads/{document_id}")
async def patient_delete_own_upload(
    document_id: int,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Allow patients to delete documents they uploaded themselves."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can use this endpoint")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.patient_id == patient.id,
            Document.is_patient_upload == True,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found or you can only delete your own uploads")

    original_name = document.original_filename

    for ext in document.extractions:
        db.delete(ext)
    for chunk in document.chunks:
        db.delete(chunk)
    db.delete(document)
    db.commit()

    audit_logger = get_audit_logger(db)
    audit_logger.log_patient_action(
        action=AuditAction.DELETE,
        user=current_user,
        patient_id=patient.id,
        patient_name=patient.patient_id,
        description=f"Patient deleted own upload: {original_name}",
        request=request,
        extra_metadata={"document_id": document_id},
    )

    return {"message": "Document deleted successfully", "document_id": document_id}


class ShareWithClinicRequest(BaseModel):
    clinic_id: int


@router.post("/my-uploads/{document_id}/share-with-clinic")
async def share_document_with_clinic(
    document_id: int,
    body: ShareWithClinicRequest,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Patient shares a personal document with a clinic they are enrolled in."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can use this endpoint")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    # Verify patient is enrolled in the clinic
    membership = (
        db.query(PatientClinic)
        .filter(
            PatientClinic.patient_id == patient.id,
            PatientClinic.clinic_id == body.clinic_id,
            PatientClinic.is_active == True,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="You are not enrolled in this clinic")

    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.patient_id == patient.id,
            Document.is_patient_upload == True,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found or not a personal upload")

    if document.clinic_id == body.clinic_id:
        raise HTTPException(status_code=400, detail="Document is already shared with this clinic")

    clinic = db.query(Clinic).filter(Clinic.id == body.clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    document.clinic_id = body.clinic_id
    patient_name = f"{current_user.first_name} {current_user.last_name}"

    # Notify all clinic admin and staff
    clinic_members = (
        db.query(User)
        .filter(
            User.clinic_id == clinic.id,
            User.role.in_([UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]),
            User.is_active == True,
        )
        .all()
    )
    notify_ids: set[int] = set()
    if clinic.admin_user_id:
        notify_ids.add(clinic.admin_user_id)
    for member in clinic_members:
        notify_ids.add(member.id)

    for uid in notify_ids:
        notification = Notification(
            user_id=uid,
            title="Patient Shared a Document",
            message=f"{patient_name} shared \"{document.original_filename}\" with your clinic.",
            notification_type=NotificationType.DOCUMENT_UPLOADED,
            related_entity_type="document",
            related_entity_id=document.id,
        )
        db.add(notification)

    audit_logger = get_audit_logger(db)
    audit_logger.log_patient_action(
        action=AuditAction.UPDATE,
        user=current_user,
        patient_id=patient.id,
        patient_name=patient.patient_id,
        description=f"Shared document '{document.original_filename}' with clinic '{clinic.name}'",
        request=request,
        extra_metadata={"document_id": document_id, "clinic_id": body.clinic_id},
        commit=False,
    )

    db.commit()

    return {
        "message": f"Document shared with {clinic.name}",
        "document_id": document_id,
        "clinic_id": body.clinic_id,
        "clinic_name": clinic.name,
    }


@router.post("/my-uploads/{document_id}/revoke-clinic-access")
async def revoke_clinic_access(
    document_id: int,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Patient revokes clinic access from a personal document."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can use this endpoint")

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.patient_id == patient.id,
            Document.is_patient_upload == True,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found or not a personal upload")

    if not document.clinic_id:
        raise HTTPException(status_code=400, detail="Document is not shared with any clinic")

    clinic = db.query(Clinic).filter(Clinic.id == document.clinic_id).first()
    clinic_name = clinic.name if clinic else "Unknown"
    document.clinic_id = None
    db.commit()

    return {"message": f"Clinic access revoked from document", "document_id": document_id}