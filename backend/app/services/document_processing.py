from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

from ..database import SessionLocal

logger = logging.getLogger(__name__)
from ..models.document import Document, DocumentStatus
from ..models.extraction import Extraction, ExtractionStatus
from .ocr import extract_text


def process_document_ocr(
    document_id: int,
    extraction_id: int,
    *,
    use_google: bool = False,
    use_gemini: bool = True,
) -> None:
    """
    Background task: run OCR on a stored document using Gemini Vision only.
    Requires GEMINI_API_KEY in environment. Stores text in Extraction.raw_text and updates Document.status.
    """
    db = SessionLocal()
    start = time.time()
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        extraction = db.query(Extraction).filter(Extraction.id == extraction_id).first()

        if not document or not extraction:
            return

        if not (os.getenv("GEMINI_API_KEY") or "").strip():
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Add it to backend/.env to use Gemini Vision OCR."
            )

        extraction.status = ExtractionStatus.IN_PROGRESS
        extraction.extraction_method = "GEMINI_OCR"
        db.commit()

        text = extract_text(
            document.file_path,
            document.mime_type,
            use_google=False,
            use_gemini=True,
        )

        extraction.raw_text = text
        extraction.status = ExtractionStatus.COMPLETED
        extraction.processing_time_seconds = float(time.time() - start)
        extraction.completed_at = datetime.now(timezone.utc)

        document.status = DocumentStatus.PROCESSED
        document.processed_date = datetime.now(timezone.utc)

        db.commit()

        # Log extracted text to terminal (preview + full length)
        preview_len = 1500
        preview = (text[:preview_len] + "..." if len(text) > preview_len else text) if text else "(empty)"
        logger.info(
            "OCR completed for document_id=%s extraction_id=%s | length=%d chars | extracted text:\n---\n%s\n---",
            document_id,
            extraction_id,
            len(text or ""),
            preview,
        )
    except Exception as e:
        err_msg = str(e)
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            logger.warning(
                "OCR failed (Gemini quota/rate limit): document_id=%s extraction_id=%s. "
                "Free tier limit exceeded for gemini-2.0-flash. Wait and retry, or check billing: https://ai.google.dev/gemini-api/docs/rate-limits",
                document_id,
                extraction_id,
            )
        logger.exception(
            "OCR failed for document_id=%s extraction_id=%s: %s",
            document_id,
            extraction_id,
            e,
        )
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

