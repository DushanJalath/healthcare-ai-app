"""
Background task service for indexing documents into vector database.

This service handles the asynchronous process of:
1. Taking extracted document text
2. Chunking it appropriately
3. Creating embeddings
4. Storing in the patient's vector database
"""

import logging
from typing import Optional
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models.document import Document
from ..models.extraction import Extraction, ExtractionStatus
from .vector_store import get_vector_store

logger = logging.getLogger(__name__)


def index_document_to_vector_db(
    document_id: int,
    extraction_id: Optional[int] = None,
    force_reindex: bool = False
) -> bool:
    """
    Index a document into the patient's vector database.
    
    This function:
    1. Retrieves the document and its extracted text
    2. Chunks the text into appropriate sizes
    3. Creates embeddings using OpenAI
    4. Stores in ChromaDB for the patient
    
    Args:
        document_id: The document ID to index
        extraction_id: Optional specific extraction ID to use
        force_reindex: If True, delete existing chunks and reindex
    
    Returns:
        True if successful, False otherwise
    """
    db = SessionLocal()
    
    try:
        # Get document
        document = db.query(Document).filter(Document.id == document_id).first()
        
        if not document:
            logger.error(f"Document {document_id} not found")
            return False
        
        if not document.patient_id:
            logger.warning(f"Document {document_id} has no patient assigned, skipping indexing")
            return False
        
        # Get extraction
        if extraction_id:
            extraction = db.query(Extraction).filter(
                Extraction.id == extraction_id,
                Extraction.document_id == document_id
            ).first()
        else:
            # Get the latest completed extraction
            extraction = db.query(Extraction).filter(
                Extraction.document_id == document_id,
                Extraction.status == ExtractionStatus.COMPLETED
            ).order_by(Extraction.completed_at.desc()).first()
        
        if not extraction:
            logger.warning(f"No completed extraction found for document {document_id}")
            return False
        
        if not extraction.raw_text or not extraction.raw_text.strip():
            logger.warning(f"Extraction {extraction.id} has no text content")
            return False
        
        # Get vector store
        vector_store = get_vector_store()
        
        # If force reindex, delete existing chunks
        if force_reindex:
            logger.info(f"Force reindexing document {document_id}")
            vector_store.delete_document(document.patient_id, document_id)
        
        # Prepare metadata
        metadata = {
            "document_id": document_id,
            "patient_id": document.patient_id,
            "document_type": document.document_type.value if document.document_type else "other",
            "original_filename": document.original_filename,
            "upload_date": document.upload_date.isoformat() if document.upload_date else None,
            "extraction_id": extraction.id,
            "extraction_method": extraction.extraction_method
        }
        
        # Add document to vector store
        chunks_added = vector_store.add_document(
            patient_id=document.patient_id,
            document_id=document_id,
            text=extraction.raw_text,
            document_metadata=metadata
        )
        
        if chunks_added > 0:
            logger.info(f"Successfully indexed document {document_id} with {chunks_added} chunks")
            return True
        else:
            logger.warning(f"No chunks were created for document {document_id}")
            return False
    
    except Exception as e:
        logger.error(f"Error indexing document {document_id}: {str(e)}", exc_info=True)
        return False
    
    finally:
        db.close()


def reindex_all_patient_documents(patient_id: int) -> dict:
    """
    Reindex all documents for a patient.
    
    Useful for:
    - Rebuilding the vector database after changes
    - Initial setup for existing patients
    - Recovery after errors
    
    Args:
        patient_id: The patient ID
    
    Returns:
        Dictionary with indexing results
    """
    db = SessionLocal()
    
    try:
        # Get vector store
        vector_store = get_vector_store()
        
        # Delete existing collection to start fresh
        vector_store.delete_patient_collection(patient_id)
        logger.info(f"Deleted existing collection for patient {patient_id}")
        
        # Get all documents for patient with completed extractions
        documents = db.query(Document).filter(
            Document.patient_id == patient_id
        ).all()
        
        results = {
            "patient_id": patient_id,
            "total_documents": len(documents),
            "indexed": 0,
            "skipped": 0,
            "failed": 0,
            "total_chunks": 0
        }
        
        for document in documents:
            # Get latest completed extraction
            extraction = db.query(Extraction).filter(
                Extraction.document_id == document.id,
                Extraction.status == ExtractionStatus.COMPLETED,
                Extraction.raw_text.isnot(None)
            ).order_by(Extraction.completed_at.desc()).first()
            
            if not extraction or not extraction.raw_text.strip():
                logger.info(f"Skipping document {document.id} - no extraction text")
                results["skipped"] += 1
                continue
            
            # Index the document
            success = index_document_to_vector_db(
                document_id=document.id,
                extraction_id=extraction.id,
                force_reindex=False  # Already deleted collection
            )
            
            if success:
                results["indexed"] += 1
            else:
                results["failed"] += 1
        
        # Get final stats
        stats = vector_store.get_patient_stats(patient_id)
        results["total_chunks"] = stats.get("total_chunks", 0)
        
        logger.info(f"Reindexing complete for patient {patient_id}: {results}")
        return results
    
    except Exception as e:
        logger.error(f"Error reindexing patient {patient_id}: {str(e)}", exc_info=True)
        return {
            "patient_id": patient_id,
            "error": str(e)
        }
    
    finally:
        db.close()


def delete_patient_vector_data(patient_id: int) -> bool:
    """
    Delete all vector data for a patient.
    
    Args:
        patient_id: The patient ID
    
    Returns:
        True if successful
    """
    try:
        vector_store = get_vector_store()
        return vector_store.delete_patient_collection(patient_id)
    
    except Exception as e:
        logger.error(f"Error deleting vector data for patient {patient_id}: {str(e)}")
        return False
