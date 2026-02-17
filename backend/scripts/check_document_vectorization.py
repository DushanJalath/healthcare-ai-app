"""
Check Document Vectorization Status

This script checks if documents are properly vectorized and can answer queries.
"""

import sys
import os
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.document import Document, DocumentStatus
from app.models.extraction import Extraction, ExtractionStatus
from app.models.document_chunk import DocumentChunk
from app.models.patient import Patient


def check_document_status(document_id: int, db: Session):
    """Check the status of a specific document"""
    print(f"\n{'='*80}")
    print(f"[DOCUMENT] Checking Document ID: {document_id}")
    print('='*80)
    
    # Get document
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        print(f"❌ Document {document_id} not found")
        return
    
    print(f"\nDocument Info:")
    print(f"   Filename: {doc.original_filename}")
    print(f"   Status: {doc.status.value}")
    print(f"   Patient ID: {doc.patient_id}")
    print(f"   Upload Date: {doc.upload_date}")
    print(f"   Processed Date: {doc.processed_date}")
    
    # Check extraction
    extractions = db.query(Extraction).filter(
        Extraction.document_id == document_id
    ).all()
    
    print(f"\nExtraction Status:")
    if not extractions:
        print("   [ERROR] No extractions found")
        return
    
    for ext in extractions:
        print(f"   ID: {ext.id}")
        print(f"   Status: {ext.status.value}")
        print(f"   Method: {ext.extraction_method}")
        print(f"   Text Length: {len(ext.raw_text) if ext.raw_text else 0} chars")
        if ext.error_message:
            print(f"   Error: {ext.error_message}")
        print()
    
    # Check latest completed extraction
    completed_ext = db.query(Extraction).filter(
        Extraction.document_id == document_id,
        Extraction.status == ExtractionStatus.COMPLETED
    ).order_by(Extraction.completed_at.desc()).first()
    
    if not completed_ext:
        print("   [ERROR] No completed extraction found")
        return
    
    print(f"\n[SUCCESS] Latest Completed Extraction:")
    print(f"   ID: {completed_ext.id}")
    print(f"   Completed: {completed_ext.completed_at}")
    print(f"   Processing Time: {completed_ext.processing_time_seconds}s")
    
    # Show text preview
    if completed_ext.raw_text:
        preview = completed_ext.raw_text[:500]
        print(f"\nText Preview (first 500 chars):")
        print(f"   {preview}...")
    
    # Check vectorization
    chunks = db.query(DocumentChunk).filter(
        DocumentChunk.document_id == document_id
    ).all()
    
    print(f"\nVectorization Status:")
    if not chunks:
        print("   [ERROR] No vector chunks found - Document NOT indexed!")
        print("\nPossible Issues:")
        print("   1. Background task failed silently")
        print("   2. No patient_id assigned to document")
        print("   3. Vector indexing threw an error")
        print(f"\n   Patient ID: {doc.patient_id} {'[OK]' if doc.patient_id else '[MISSING]'}")
        return
    
    print(f"   [SUCCESS] Found {len(chunks)} chunks")
    print(f"   Chunk IDs: {[c.id for c in chunks[:5]]}{'...' if len(chunks) > 5 else ''}")
    print(f"   Token counts: {[c.total_tokens for c in chunks[:5]]}{'...' if len(chunks) > 5 else ''}")
    
    # Show first chunk preview
    if chunks:
        first_chunk = chunks[0]
        print(f"\nFirst Chunk Preview:")
        print(f"   Chunk Index: {first_chunk.chunk_index}")
        print(f"   Tokens: {first_chunk.total_tokens}")
        print(f"   Text: {first_chunk.chunk_text[:200]}...")
        print(f"   Embedding Dimension: {len(first_chunk.embedding) if first_chunk.embedding else 0}")


def check_patient_vector_store(patient_id: int, db: Session):
    """Check the vector store status for a patient"""
    print(f"\n{'='*80}")
    print(f"[PATIENT] Checking Patient ID: {patient_id}")
    print('='*80)
    
    # Get patient
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        print(f"[ERROR] Patient {patient_id} not found")
        return
    
    print(f"\nPatient Info:")
    if patient.user:
        print(f"   Name: {patient.user.first_name} {patient.user.last_name}")
        print(f"   Email: {patient.user.email}")
    print(f"   Patient ID: {patient.patient_id}")
    
    # Check documents
    documents = db.query(Document).filter(
        Document.patient_id == patient_id
    ).all()
    
    print(f"\nDocuments: {len(documents)}")
    for doc in documents:
        status_icon = "[OK]" if doc.status == DocumentStatus.PROCESSED else "[FAIL]"
        print(f"   {status_icon} ID: {doc.id} | {doc.original_filename} | Status: {doc.status.value}")
    
    # Check total chunks
    total_chunks = db.query(DocumentChunk).filter(
        DocumentChunk.patient_id == patient_id
    ).count()
    
    print(f"\nVector Store:")
    print(f"   Total Chunks: {total_chunks}")
    
    if total_chunks == 0:
        print(f"   [ERROR] No vector chunks found for this patient!")
        print(f"\n   This patient cannot use RAG/chat features yet.")
    else:
        print(f"   [SUCCESS] Patient has {total_chunks} indexed chunks")
        print(f"   [SUCCESS] RAG/chat features are available")
        
        # Show chunk distribution by document
        from sqlalchemy import func
        chunk_dist = db.query(
            DocumentChunk.document_id,
            func.count(DocumentChunk.id).label('count')
        ).filter(
            DocumentChunk.patient_id == patient_id
        ).group_by(DocumentChunk.document_id).all()
        
        print(f"\nChunks by Document:")
        for doc_id, count in chunk_dist:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            filename = doc.original_filename if doc else "Unknown"
            print(f"      Document {doc_id} ({filename}): {count} chunks")


def list_all_documents(db: Session):
    """List all documents and their vectorization status"""
    print(f"\n{'='*80}")
    print("[OVERVIEW] All Documents")
    print('='*80)
    
    docs = db.query(Document).order_by(Document.upload_date.desc()).limit(10).all()
    
    print(f"\nMost Recent {len(docs)} Documents:\n")
    for doc in docs:
        chunks_count = db.query(DocumentChunk).filter(
            DocumentChunk.document_id == doc.id
        ).count()
        
        status_icon = "[OK]" if doc.status == DocumentStatus.PROCESSED else "[...]" if doc.status == DocumentStatus.PROCESSING else "[FAIL]"
        vector_icon = "[VEC]" if chunks_count > 0 else "[---]"
        patient_str = f"{doc.patient_id:3d}" if doc.patient_id else "N/A"
        
        print(f"{status_icon} {vector_icon} ID: {doc.id:3d} | Patient: {patient_str:>3s} | "
              f"Chunks: {chunks_count:3d} | {doc.original_filename[:40]}")


def main():
    db = SessionLocal()
    
    try:
        if len(sys.argv) > 1:
            if sys.argv[1] == "doc":
                # Check specific document
                doc_id = int(sys.argv[2])
                check_document_status(doc_id, db)
            elif sys.argv[1] == "patient":
                # Check specific patient
                patient_id = int(sys.argv[2])
                check_patient_vector_store(patient_id, db)
            else:
                print("Usage:")
                print("  python check_document_vectorization.py            - List all documents")
                print("  python check_document_vectorization.py doc <id>   - Check specific document")
                print("  python check_document_vectorization.py patient <id> - Check patient's vector store")
        else:
            # List all documents
            list_all_documents(db)
            
            print(f"\nUsage:")
            print("   python scripts/check_document_vectorization.py doc <document_id>")
            print("   python scripts/check_document_vectorization.py patient <patient_id>")
    
    finally:
        db.close()


if __name__ == "__main__":
    main()
