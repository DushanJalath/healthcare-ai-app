from __future__ import annotations

import time
from datetime import datetime, timezone

from ..database import SessionLocal
from ..models.document import Document, DocumentStatus
from ..models.extraction import Extraction, ExtractionStatus
from .ocr import extract_text


def process_document_ocr(document_id: int, extraction_id: int, *, use_google: bool = True) -> None:
    """
    Background task:
    - Run OCR on a stored document
    - Store text in Extraction.raw_text
    - Update Document.status
    """
    db = SessionLocal()
    start = time.time()
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        extraction = db.query(Extraction).filter(Extraction.id == extraction_id).first()

        if not document or not extraction:
            return

        extraction.status = ExtractionStatus.IN_PROGRESS
        extraction.extraction_method = "GOOGLE_OCR" if use_google else "TESSERACT_OCR"
        db.commit()

        text = extract_text(document.file_path, document.mime_type, use_google=use_google)

        extraction.raw_text = text
        extraction.status = ExtractionStatus.COMPLETED
        extraction.processing_time_seconds = float(time.time() - start)
        extraction.completed_at = datetime.now(timezone.utc)

        document.status = DocumentStatus.PROCESSED
        document.processed_date = datetime.now(timezone.utc)

        db.commit()
    except Exception as e:
        try:
            extraction = db.query(Extraction).filter(Extraction.id == extraction_id).first()
            document = db.query(Document).filter(Document.id == document_id).first()
            if extraction:
                extraction.status = ExtractionStatus.FAILED
                extraction.error_message = str(e)
                extraction.processing_time_seconds = float(time.time() - start)
                extraction.completed_at = datetime.now(timezone.utc)
            if document:
                document.status = DocumentStatus.FAILED
            db.commit()
        finally:
            pass
    finally:
        db.close()

