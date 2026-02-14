from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

from .google_ocr import extract_text_google_bytes, GoogleOcrError
from .gemini_ocr import extract_text_gemini, GeminiOcrError
from .openai_ocr import extract_text_openai, OpenAIOcrError
from .pdf_pages import pdf_to_pil_pages


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
    PDF OCR: convert PDF pages to images (pdf2image or PyMuPDF), then OCR each page with Google Vision.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(file_path)

    try:
        pages = pdf_to_pil_pages(file_path)
    except Exception as e:
        raise OcrUnsupportedFileType(str(e)) from e

    if not pages:
        return ""

    texts: list[str] = []
    with tempfile.TemporaryDirectory(prefix="medikeep_ocr_") as tmpdir:
        for idx, page in enumerate(pages, start=1):
            img_path = os.path.join(tmpdir, f"page_{idx}.png")
            page.save(img_path, format="PNG")
            texts.append(extract_text_from_image_file_google(img_path, "image/png"))
    return "\n\n".join(t for t in texts if t.strip())


def extract_text(
    file_path: str,
    mime_type: Optional[str] = None,
    *,
    use_google: bool = False,
    use_gemini: bool = False,
    use_openai: bool = True,
) -> str:
    """
    OCR using OpenAI Vision by default (use_openai=True). 
    Requires OPENAI_API_KEY in environment.
    Legacy support for Gemini Vision (use_gemini=True) and Google Vision (use_google=True).
    """
    if use_openai:
        return extract_text_openai(file_path, mime_type)
    
    if use_gemini:
        return extract_text_gemini(file_path, mime_type)

    # Legacy paths (not used when app uses OpenAI-only)
    if use_google:
        if _is_pdf(mime_type, file_path):
            return extract_text_from_pdf_google(file_path)
        return extract_text_from_image_file_google(file_path, mime_type)

    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
    except Exception as e:
        raise GoogleOcrError(
            "Fallback OCR requested but dependencies are missing (pytesseract/Pillow)."
        ) from e
    if _is_pdf(mime_type, file_path):
        pages = pdf_to_pil_pages(file_path)
        return "\n\n".join(pytesseract.image_to_string(p) for p in pages if p is not None)
    return pytesseract.image_to_string(Image.open(file_path))

