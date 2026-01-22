from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

from .google_ocr import extract_text_google_bytes, GoogleOcrError


class OcrUnsupportedFileType(ValueError):
    pass


def _read_bytes(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def _is_pdf(mime_type: Optional[str], file_path: str) -> bool:
    if mime_type == "application/pdf":
        return True
    return Path(file_path).suffix.lower() == ".pdf"


def extract_text_from_image_file_google(file_path: str, mime_type: Optional[str]) -> str:
    content = _read_bytes(file_path)
    return extract_text_google_bytes(content, mime_type=mime_type)


def extract_text_from_pdf_google(file_path: str) -> str:
    """
    MVP PDF OCR: convert PDF pages to images locally (pdf2image), then OCR each page.

    Note: Google Vision performs best for PDFs via GCS async batch APIs.
    This local approach keeps your current architecture simple and FastAPI-ready.
    """
    try:
        from pdf2image import convert_from_path  # type: ignore
    except Exception as e:
        raise OcrUnsupportedFileType(
            "pdf2image is required for PDF OCR but is not available."
        ) from e

    if not os.path.exists(file_path):
        raise FileNotFoundError(file_path)

    pages = convert_from_path(file_path)
    if not pages:
        return ""

    texts: list[str] = []
    with tempfile.TemporaryDirectory(prefix="medikeep_ocr_") as tmpdir:
        for idx, page in enumerate(pages, start=1):
            img_path = os.path.join(tmpdir, f"page_{idx}.png")
            page.save(img_path, format="PNG")
            texts.append(extract_text_from_image_file_google(img_path, "image/png"))
    return "\n\n".join(t for t in texts if t.strip())


def extract_text(file_path: str, mime_type: Optional[str] = None, *, use_google: bool = True) -> str:
    """
    Agentic switch for OCR engines.
    - Google Vision: production default
    - Tesseract: fallback (optional)
    """
    if use_google:
        if _is_pdf(mime_type, file_path):
            return extract_text_from_pdf_google(file_path)
        return extract_text_from_image_file_google(file_path, mime_type)

    # Fallback OCR engine (best-effort). Keep optional to avoid breaking prod.
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
        from pdf2image import convert_from_path  # type: ignore
    except Exception as e:
        raise GoogleOcrError(
            "Fallback OCR requested but dependencies are missing (pytesseract/Pillow/pdf2image)."
        ) from e

    if _is_pdf(mime_type, file_path):
        pages = convert_from_path(file_path)
        return "\n\n".join(pytesseract.image_to_string(p) for p in pages if p is not None)
    return pytesseract.image_to_string(Image.open(file_path))

