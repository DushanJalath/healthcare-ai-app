"""
Vector Database Management Router

Provides endpoints for managing patient vector databases:
- Reindex all documents for a patient
- Get vector database statistics
- Delete vector data
- Trigger indexing for specific documents
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from ..database import get_db
from ..models.user import User, UserRole
from ..models.patient import Patient
from ..models.document import Document
from ..models.extraction import Extraction, ExtractionStatus
from ..utils.deps import get_current_active_user, require_clinic_access
from ..services.vector_store import get_vector_store
from ..services.vector_indexing import (
    index_document_to_vector_db,
    reindex_all_patient_documents,
    delete_patient_vector_data
)

router = APIRouter(prefix="/vector", tags=["vector-management"])


class VectorStatsResponse(BaseModel):
    patient_id: int
    total_chunks: int
    total_documents: int
    collection_name: str


class ReindexResponse(BaseModel):
    patient_id: int
    total_documents: int
    indexed: int
    skipped: int
    failed: int
    total_chunks: int
    message: str


class IndexDocumentRequest(BaseModel):
    force_reindex: bool = False


@router.get("/patients/{patient_id}/stats", response_model=VectorStatsResponse)
async def get_patient_vector_stats(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get statistics about a patient's vector database.
    
    Returns:
    - Number of indexed documents
    - Number of chunks
    - Collection name
    """
    # Check permissions
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Permission check
    if current_user.role == UserRole.PATIENT:
        if patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user.role in [UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]:
        # Check if patient belongs to user's clinic
        if current_user.clinic_id:
            from ..models.patient_clinic import PatientClinic
            membership = db.query(PatientClinic).filter(
                PatientClinic.patient_id == patient_id,
                PatientClinic.clinic_id == current_user.clinic_id,
                PatientClinic.is_active == True
            ).first()
            if not membership:
                raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        vector_store = get_vector_store()
        stats = vector_store.get_patient_stats(patient_id)
        
        return VectorStatsResponse(
            patient_id=stats["patient_id"],
            total_chunks=stats.get("total_chunks", 0),
            total_documents=stats.get("total_documents", 0),
            collection_name=stats.get("collection_name", "")
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving vector stats: {str(e)}"
        )


@router.post("/patients/{patient_id}/reindex", response_model=ReindexResponse)
async def reindex_patient_documents(
    patient_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """
    Reindex all documents for a patient.
    
    This will:
    1. Delete the existing vector database
    2. Reprocess all completed extractions
    3. Create new embeddings and chunks
    
    Useful for:
    - Recovering from indexing errors
    - Updating to new chunking strategies
    - Initial setup for existing patients
    """
    # Check permissions
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check clinic access
    if current_user.clinic_id:
        from ..models.patient_clinic import PatientClinic
        membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient_id,
            PatientClinic.clinic_id == current_user.clinic_id,
            PatientClinic.is_active == True
        ).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        # Run reindexing in background
        background_tasks.add_task(reindex_all_patient_documents, patient_id)
        
        # Get current stats to return
        document_count = db.query(Document).filter(
            Document.patient_id == patient_id
        ).count()
        
        return ReindexResponse(
            patient_id=patient_id,
            total_documents=document_count,
            indexed=0,
            skipped=0,
            failed=0,
            total_chunks=0,
            message="Reindexing started in background. Check stats endpoint for progress."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error starting reindex: {str(e)}"
        )


@router.post("/documents/{document_id}/index")
async def index_single_document(
    document_id: int,
    request: IndexDocumentRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """
    Index a specific document to the vector database.
    
    Use force_reindex=true to reindex an already indexed document.
    """
    # Check document exists and user has access
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.patient_id:
        raise HTTPException(status_code=400, detail="Document has no patient assigned")
    
    # Check clinic access
    if current_user.clinic_id and document.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if document has completed extraction
    extraction = db.query(Extraction).filter(
        Extraction.document_id == document_id,
        Extraction.status == ExtractionStatus.COMPLETED
    ).order_by(Extraction.completed_at.desc()).first()
    
    if not extraction:
        raise HTTPException(
            status_code=400,
            detail="Document has no completed extraction. Run OCR first."
        )
    
    # Run indexing in background
    background_tasks.add_task(
        index_document_to_vector_db,
        document_id,
        extraction.id,
        request.force_reindex
    )
    
    return {
        "message": "Document indexing started in background",
        "document_id": document_id,
        "patient_id": document.patient_id,
        "force_reindex": request.force_reindex
    }


@router.delete("/patients/{patient_id}/vector-data")
async def delete_patient_vectors(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """
    Delete all vector data for a patient.
    
    WARNING: This is irreversible. You'll need to reindex to restore.
    """
    # Check permissions
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check clinic access
    if current_user.clinic_id:
        from ..models.patient_clinic import PatientClinic
        membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient_id,
            PatientClinic.clinic_id == current_user.clinic_id,
            PatientClinic.is_active == True
        ).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        success = delete_patient_vector_data(patient_id)
        
        if success:
            return {
                "message": f"Vector data deleted for patient {patient_id}",
                "patient_id": patient_id
            }
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to delete vector data"
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error deleting vector data: {str(e)}"
        )


@router.post("/patients/{patient_id}/search-test")
async def test_vector_search(
    patient_id: int,
    query: str,
    top_k: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Test vector search for a patient without running the full RAG pipeline.
    
    Useful for debugging and understanding what chunks are being retrieved.
    """
    # Check permissions
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Permission check
    if current_user.role == UserRole.PATIENT:
        if patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user.role in [UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]:
        if current_user.clinic_id:
            from ..models.patient_clinic import PatientClinic
            membership = db.query(PatientClinic).filter(
                PatientClinic.patient_id == patient_id,
                PatientClinic.clinic_id == current_user.clinic_id,
                PatientClinic.is_active == True
            ).first()
            if not membership:
                raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        vector_store = get_vector_store()
        chunks = vector_store.search(
            patient_id=patient_id,
            query=query,
            top_k=top_k
        )
        
        return {
            "patient_id": patient_id,
            "query": query,
            "top_k": top_k,
            "results_count": len(chunks),
            "chunks": chunks
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error performing vector search: {str(e)}"
        )
