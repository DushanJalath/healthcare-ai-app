"""
OpenAI Vision OCR: extract text from images/PDFs using OpenAI GPT-4o-mini Vision API.
Uses OPENAI_API_KEY from environment. Cost-effective alternative to Gemini Vision API.
"""
from __future__ import annotations

import os
import tempfile
import base64
from pathlib import Path
from typing import Optional


class OpenAIOcrError(RuntimeError):
    pass


def _get_client():
    """Lazily create the OpenAI client. Requires openai and OPENAI_API_KEY."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        raise OpenAIOcrError("OPENAI_API_KEY is not set. Add it to backend/.env for OpenAI Vision OCR.")
    try:
        from openai import OpenAI
    except ImportError as e:
        raise OpenAIOcrError(
            "openai is not installed. Add it to backend/requirements.txt"
        ) from e
    return OpenAI(api_key=api_key.strip())


def _encode_image_to_base64(image_path: str) -> str:
    """Encode an image file to base64 string."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')


def _extract_text_openai_image_bytes(content: bytes, mime_type: Optional[str] = None) -> str:
    """Extract text from image bytes using OpenAI Vision."""
    try:
        from openai import OpenAI
    except ImportError as e:
        raise OpenAIOcrError("openai is not installed.") from e

    client = _get_client()
    
    # Normalize mime type
    mt = (mime_type or "image/png").strip().lower()
    if mt == "image/jpg":
        mt = "image/jpeg"
    
    # Encode bytes to base64
    base64_image = base64.b64encode(content).decode('utf-8')
    
    prompt = "Extract all text from this image exactly as it appears. Preserve layout and line breaks where relevant. If there is no text, respond with an empty string."
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Use gpt-4o-mini for cost-effective vision OCR
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mt};base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=4096,
            temperature=0.0
        )
        
        if not response or not response.choices:
            return ""
        return (response.choices[0].message.content or "").strip()
    except Exception as e:
        raise OpenAIOcrError(f"OpenAI Vision API request failed: {str(e)}") from e


def extract_text_openai_bytes(content: bytes, *, mime_type: Optional[str] = None) -> str:
    """OCR image bytes using OpenAI Vision. For PDFs use extract_text_openai(file_path)."""
    return _extract_text_openai_image_bytes(content, mime_type)


def extract_text_openai_image_file(file_path: str, mime_type: Optional[str] = None) -> str:
    """Extract text from an image file using OpenAI Vision."""
    with open(file_path, "rb") as f:
        content = f.read()
    return extract_text_openai_bytes(content, mime_type=mime_type)


def _is_pdf(mime_type: Optional[str], file_path: str) -> bool:
    if mime_type == "application/pdf":
        return True
    return Path(file_path).suffix.lower() == ".pdf"


def extract_text_openai_pdf(file_path: str) -> str:
    """Extract text from PDF by converting pages to images and running OpenAI Vision on each page."""
    from .pdf_pages import pdf_to_pil_pages

    if not os.path.exists(file_path):
        raise FileNotFoundError(file_path)

    try:
        pages = pdf_to_pil_pages(file_path)
    except Exception as e:
        raise OpenAIOcrError(str(e)) from e

    if not pages:
        return ""

    texts: list[str] = []
    with tempfile.TemporaryDirectory(prefix="medikeep_openai_ocr_") as tmpdir:
        for idx, page in enumerate(pages, start=1):
            img_path = os.path.join(tmpdir, f"page_{idx}.png")
            page.save(img_path, format="PNG")
            texts.append(extract_text_openai_image_file(img_path, "image/png"))
    return "\n\n".join(t for t in texts if t.strip())


def extract_text_openai(file_path: str, mime_type: Optional[str] = None) -> str:
    """Extract text from a file (image or PDF) using OpenAI Vision."""
    if _is_pdf(mime_type, file_path):
        return extract_text_openai_pdf(file_path)
    return extract_text_openai_image_file(file_path, mime_type)
