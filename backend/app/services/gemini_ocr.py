"""
Gemini Vision OCR: extract text from images/PDFs using Google Gemini API.
Uses GEMINI_API_KEY from environment. Preferred when set; otherwise backend can use Google Cloud Vision.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional


class GeminiOcrError(RuntimeError):
    pass


def _get_client():
    """Lazily create the Gemini client. Requires google-genai and GEMINI_API_KEY."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or not api_key.strip():
        raise GeminiOcrError("GEMINI_API_KEY is not set. Add it to backend/.env for Gemini Vision OCR.")
    try:
        from google import genai
    except ImportError as e:
        raise GeminiOcrError(
            "google-genai is not installed. Add it to backend/requirements.txt"
        ) from e
    return genai.Client(api_key=api_key.strip())


def _extract_text_gemini_image_bytes(content: bytes, mime_type: Optional[str] = None) -> str:
    """Extract text from image bytes using Gemini Vision."""
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        raise GeminiOcrError("google-genai is not installed.") from e

    client = _get_client()
    # Normalize mime for Gemini (e.g. image/jpg -> image/jpeg)
    mt = (mime_type or "image/png").strip().lower()
    if mt == "image/jpg":
        mt = "image/jpeg"

    prompt = "Extract all text from this image exactly as it appears. Preserve layout and line breaks where relevant. If there is no text, respond with an empty string."
    # Use a current model: gemini-2.0-flash (gemini-1.5-flash returns 404 on v1beta)
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            types.Part.from_bytes(data=content, mime_type=mt),
            prompt,
        ],
    )
    if not response or not response.candidates:
        return ""
    return (response.text or "").strip()


def extract_text_gemini_bytes(content: bytes, *, mime_type: Optional[str] = None) -> str:
    """OCR image bytes using Gemini Vision. For PDFs use extract_text_gemini(file_path)."""
    return _extract_text_gemini_image_bytes(content, mime_type)


def extract_text_gemini_image_file(file_path: str, mime_type: Optional[str] = None) -> str:
    """Extract text from an image file using Gemini Vision."""
    with open(file_path, "rb") as f:
        content = f.read()
    return extract_text_gemini_bytes(content, mime_type=mime_type)


def _is_pdf(mime_type: Optional[str], file_path: str) -> bool:
    if mime_type == "application/pdf":
        return True
    return Path(file_path).suffix.lower() == ".pdf"


def extract_text_gemini_pdf(file_path: str) -> str:
    """Extract text from PDF by converting pages to images (pdf2image or PyMuPDF) and running Gemini on each page."""
    from .pdf_pages import pdf_to_pil_pages

    if not os.path.exists(file_path):
        raise FileNotFoundError(file_path)

    try:
        pages = pdf_to_pil_pages(file_path)
    except Exception as e:
        raise GeminiOcrError(str(e)) from e

    if not pages:
        return ""

    texts: list[str] = []
    with tempfile.TemporaryDirectory(prefix="medikeep_gemini_ocr_") as tmpdir:
        for idx, page in enumerate(pages, start=1):
            img_path = os.path.join(tmpdir, f"page_{idx}.png")
            page.save(img_path, format="PNG")
            texts.append(extract_text_gemini_image_file(img_path, "image/png"))
    return "\n\n".join(t for t in texts if t.strip())


def extract_text_gemini(file_path: str, mime_type: Optional[str] = None) -> str:
    """Extract text from a file (image or PDF) using Gemini Vision."""
    if _is_pdf(mime_type, file_path):
        return extract_text_gemini_pdf(file_path)
    return extract_text_gemini_image_file(file_path, mime_type)
