from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func, and_
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from ..database import get_db
from ..models.patient import Patient
from ..models.patient_clinic import PatientClinic
from ..models.document import Document, DocumentStatus, DocumentType
from ..models.extraction import Extraction
from ..models.user import User, UserRole
from ..schemas.patient import PatientDetailResponse
from ..schemas.document import DocumentResponse
from ..utils.deps import get_current_active_user
from ..utils.audit import get_audit_logger, AuditAction, AuditEntityType

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
        "user_email": patient.user.email if patient.user else None,
        "clinic_name": primary_clinic_name,  # Primary clinic for backward compatibility
        "clinic_names": clinic_names,  # All clinic names from memberships
        "documents_count": documents_count,
        "last_visit": None  # This could be calculated based on latest document or appointment
    }
    
    return PatientDetailResponse(**response_data)