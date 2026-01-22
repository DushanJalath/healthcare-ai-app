from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from pathlib import Path
import os

from ..database import get_db
from ..models.document import Document, DocumentStatus, DocumentType
from ..models.patient import Patient
from ..models.patient_clinic import PatientClinic
from ..models.user import User, UserRole
from ..models.extraction import Extraction, ExtractionType, ExtractionStatus
from ..schemas.document import (
    DocumentCreate, DocumentUpdate, DocumentResponse, 
    DocumentListResponse, DocumentAssignmentRequest, DocumentUploadResponse,
    BulkDocumentOperationRequest
)
from ..models.clinic import Clinic
from ..utils.deps import get_current_active_user, require_clinic_access
from ..utils.file_handler import save_upload_file, delete_file, get_file_info
from ..services.document_processing import process_document_ocr

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    patient_id: Optional[int] = Form(None),
    document_type: Optional[DocumentType] = Form(None),
    notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Upload a new document."""
    
    # Save file to storage
    try:
        file_path, unique_filename, file_size = await save_upload_file(file)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    
    # Get clinic_id from user's clinic_id (both clinic_admin and clinic_staff now have this)
    if not current_user.clinic_id:
        # Clean up uploaded file
        delete_file(file_path)
        raise HTTPException(status_code=400, detail="User is not assigned to a clinic")
    
    clinic_id = current_user.clinic_id
    
    # Verify clinic exists and is active
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic or not clinic.is_active:
        # Clean up uploaded file
        delete_file(file_path)
        raise HTTPException(status_code=404, detail="Clinic not found or inactive")
    
    # Validate patient assignment - check PatientClinic membership
    if patient_id:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            # Clean up uploaded file
            delete_file(file_path)
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Check if patient is enrolled in this clinic via PatientClinic
        membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient_id,
            PatientClinic.clinic_id == clinic_id,
            PatientClinic.is_active == True
        ).first()
        if not membership:
            # Clean up uploaded file
            delete_file(file_path)
            raise HTTPException(status_code=404, detail="Patient is not enrolled in your clinic")
    
    # Create document record
    document = Document(
        patient_id=patient_id,
        clinic_id=clinic_id,
        filename=unique_filename,
        original_filename=file.filename or "unknown",
        file_path=file_path,
        file_size=file_size,
        mime_type=file.content_type or "application/octet-stream",
        document_type=document_type or DocumentType.OTHER,
        status=DocumentStatus.UPLOADED,
        notes=notes
    )
    
    db.add(document)
    db.commit()
    db.refresh(document)
    
    return DocumentUploadResponse(
        message="Document uploaded successfully",
        document=DocumentResponse.from_orm(document)
    )


@router.post("/{document_id}/ocr")
async def run_document_ocr(
    document_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access),
):
    """
    Trigger OCR for a document and store the extracted text in `extractions.raw_text`.
    Uses Google Vision OCR by default.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Clinic permission (clinic users can only process their clinic's documents)
    if current_user.clinic_id and document.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Access denied")

    extraction = Extraction(
        document_id=document.id,
        patient_id=document.patient_id,
        extraction_type=ExtractionType.GENERAL,
        status=ExtractionStatus.PENDING,
        extraction_method="GOOGLE_OCR",
    )

    document.status = DocumentStatus.PROCESSING
    db.add(extraction)
    db.commit()
    db.refresh(extraction)

    background_tasks.add_task(process_document_ocr, document.id, extraction.id, use_google=True)

    return {
        "message": "OCR started",
        "document_id": document.id,
        "extraction_id": extraction.id,
        "status": extraction.status.value,
    }

@router.get("", response_model=DocumentListResponse)
@router.get("/", response_model=DocumentListResponse)
async def get_documents(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    patient_id: Optional[int] = None,
    status: Optional[DocumentStatus] = None,
    document_type: Optional[DocumentType] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get documents with filtering and pagination."""
    
    # Build query based on user role
    query = db.query(Document)
    
    if current_user.role == UserRole.PATIENT:
        # Patients can only see their own documents
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient profile not found")
        query = query.filter(Document.patient_id == patient.id)
    
    elif current_user.role in [UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]:
        # Clinic users see documents from their clinic
        # Use current_user.clinic_id which is available for both admin and staff
        if current_user.clinic_id:
            query = query.filter(Document.clinic_id == current_user.clinic_id)
        else:
            # If no clinic_id assigned, return empty result
            query = query.filter(Document.id == -1)  # Impossible condition
    
    # Apply filters
    if patient_id:
        query = query.filter(Document.patient_id == patient_id)
    if status:
        query = query.filter(Document.status == status)
    if document_type:
        query = query.filter(Document.document_type == document_type)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * per_page
    documents = query.offset(offset).limit(per_page).all()
    
    # Calculate pagination flags
    has_next = (page * per_page) < total
    has_previous = page > 1
    
    return DocumentListResponse(
        documents=[DocumentResponse.from_orm(doc) for doc in documents],
        total=total,
        page=page,
        per_page=per_page,
        has_next=has_next,
        has_previous=has_previous
    )

@router.get("/analytics")
async def get_document_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Get document analytics and statistics."""
    
    # Get clinic - handle both clinic_admin and clinic_staff
    if current_user.role == UserRole.CLINIC_ADMIN:
        # Clinic admin - try admin_user_id first, then clinic_id
        clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
        if not clinic and current_user.clinic_id:
            clinic = db.query(Clinic).filter(Clinic.id == current_user.clinic_id).first()
    elif current_user.role == UserRole.CLINIC_STAFF:
        # Clinic staff - use clinic_id
        if not current_user.clinic_id:
            raise HTTPException(status_code=400, detail="User is not assigned to a clinic")
        clinic = db.query(Clinic).filter(Clinic.id == current_user.clinic_id).first()
    else:
        # Should not reach here due to require_clinic_access, but handle gracefully
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not clinic:
        raise HTTPException(status_code=400, detail="Clinic not found")
    
    # Build base query for clinic documents
    base_query = db.query(Document).filter(Document.clinic_id == clinic.id)
    
    # Total documents
    total = base_query.count()
    
    # Documents by status
    status_stats = db.query(
        Document.status,
        func.count(Document.id)
    ).filter(
        Document.clinic_id == clinic.id
    ).group_by(Document.status).all()
    
    by_status = {status.value: count for status, count in status_stats}
    
    # Documents by type
    type_stats = db.query(
        Document.document_type,
        func.count(Document.id)
    ).filter(
        Document.clinic_id == clinic.id
    ).group_by(Document.document_type).all()
    
    by_type = {doc_type.value: count for doc_type, count in type_stats}
    
    # Storage used
    storage_used = db.query(func.sum(Document.file_size)).filter(
        Document.clinic_id == clinic.id
    ).scalar() or 0
    
    return {
        "total": total,
        "byStatus": by_status,
        "byType": by_type,
        "storageUsed": storage_used
    }

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get document by ID."""
    document = db.query(Document).filter(Document.id == document_id).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check permissions
    if current_user.role == UserRole.PATIENT:
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient or document.patient_id != patient.id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    elif current_user.role in [UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]:
        clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
        if clinic and document.clinic_id != clinic.id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return DocumentResponse.from_orm(document)

@router.get("/{document_id}/download")
async def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Download document file."""
    document = db.query(Document).filter(Document.id == document_id).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check permissions (same logic as get_document)
    if current_user.role == UserRole.PATIENT:
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient or document.patient_id != patient.id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    elif current_user.role in [UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]:
        clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
        if clinic and document.clinic_id != clinic.id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if file exists
    if not os.path.exists(document.file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
    
    return FileResponse(
        path=document.file_path,
        filename=document.original_filename,
        media_type=document.mime_type
    )

@router.put("/{document_id}/assign", response_model=DocumentResponse)
async def assign_document_to_patient(
    document_id: int,
    assignment: DocumentAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Assign document to a patient."""
    
    # Get document
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check clinic permission
    clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
    if clinic and document.clinic_id != clinic.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Validate patient
    patient = db.query(Patient).filter(
        Patient.id == assignment.patient_id,
        Patient.clinic_id == document.clinic_id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found in clinic")
    
    # Update assignment
    document.patient_id = assignment.patient_id
    db.commit()
    db.refresh(document)
    
    return DocumentResponse.from_orm(document)

@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    document_update: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Update document metadata."""
    
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check permissions
    clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
    if clinic and document.clinic_id != clinic.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update fields
    update_data = document_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(document, field, value)
    
    db.commit()
    db.refresh(document)
    
    return DocumentResponse.from_orm(document)

@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Delete document."""
    
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check permissions
    clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
    if clinic and document.clinic_id != clinic.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Delete file from storage
    delete_file(document.file_path)
    
    # Delete database record
    db.delete(document)
    db.commit()
    
    return {"message": "Document deleted successfully"}

@router.post("/bulk")
async def bulk_document_operation(
    request: BulkDocumentOperationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Perform bulk operations on documents."""
    
    # Get clinic
    clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
    if not clinic:
        raise HTTPException(status_code=400, detail="Clinic not found")
    
    # Get documents and verify they belong to clinic
    documents = db.query(Document).filter(
        Document.id.in_(request.document_ids),
        Document.clinic_id == clinic.id
    ).all()
    
    if len(documents) != len(request.document_ids):
        raise HTTPException(
            status_code=400,
            detail="Some documents not found or access denied"
        )
    
    # Perform operation
    if request.operation == "delete":
        for doc in documents:
            delete_file(doc.file_path)
            db.delete(doc)
        db.commit()
        return {"message": f"{len(documents)} documents deleted successfully"}
    
    elif request.operation == "assign":
        if not request.parameters or "patient_id" not in request.parameters:
            raise HTTPException(status_code=400, detail="patient_id required for assign operation")
        
        patient_id = request.parameters["patient_id"]
        patient = db.query(Patient).filter(
            Patient.id == patient_id,
            Patient.clinic_id == clinic.id
        ).first()
        
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        for doc in documents:
            doc.patient_id = patient_id
        db.commit()
        return {"message": f"{len(documents)} documents assigned to patient successfully"}
    
    elif request.operation == "update_status":
        if not request.parameters or "status" not in request.parameters:
            raise HTTPException(status_code=400, detail="status required for update_status operation")
        
        new_status = DocumentStatus(request.parameters["status"])
        for doc in documents:
            doc.status = new_status
        db.commit()
        return {"message": f"{len(documents)} documents status updated successfully"}
    
    elif request.operation == "update_type":
        if not request.parameters or "document_type" not in request.parameters:
            raise HTTPException(status_code=400, detail="document_type required for update_type operation")
        
        new_type = DocumentType(request.parameters["document_type"])
        for doc in documents:
            doc.document_type = new_type
        db.commit()
        return {"message": f"{len(documents)} documents type updated successfully"}
    
    else:
        raise HTTPException(status_code=400, detail=f"Unknown operation: {request.operation}")
        raise HTTPException(status_code=400, detail=f"Unknown operation: {request.operation}")