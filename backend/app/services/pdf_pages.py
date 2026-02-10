"""
Convert a PDF file to a list of PIL Images (one per page).
Tries pdf2image first (requires Poppler on Windows); falls back to PyMuPDF if available.
"""
from __future__ import annotations

import io
import os
from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from PIL import Image


def _pdf_to_pages_pymupdf(file_path: str) -> List["Image.Image"]:
    """Convert PDF to PIL pages using PyMuPDF (no Poppler required)."""
    import fitz  # PyMuPDF
    from PIL import Image
    doc = fitz.open(file_path)
    pages = []
    try:
        for i in range(len(doc)):
            page = doc.load_page(i)
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes)).copy()
            pages.append(img)
    finally:
        doc.close()
    return pages


def pdf_to_pil_pages(file_path: str) -> List["Image.Image"]:
    """
    Return a list of PIL Images, one per PDF page.
    Uses pdf2image if Poppler is available; otherwise PyMuPDF (works on Windows without Poppler).
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(file_path)

    # 1) Try pdf2image (needs Poppler on Windows; or module missing)
    try:
        from pdf2image import convert_from_path  # type: ignore
        pages = convert_from_path(file_path)
        if pages:
            return list(pages)
    except Exception as e:
        err_msg = str(e).lower()
        # 2) Fallback: PyMuPDF when pdf2image missing or fails (e.g. Poppler not installed)
        use_fallback = (
            isinstance(e, ImportError)
            or "pdf2image" in err_msg
            or "poppler" in err_msg
            or "page count" in err_msg
            or "unable" in err_msg
            or "is poppler" in err_msg
        )
        if use_fallback:
            try:
                return _pdf_to_pages_pymupdf(file_path)
            except ImportError:
                raise RuntimeError(
                    "PDF conversion failed. Install pymupdf: pip install pymupdf"
                ) from e
        raise

    # If pdf2image returned empty, try PyMuPDF
    try:
        return _pdf_to_pages_pymupdf(file_path)
    except ImportError:
        raise RuntimeError(
            "PDF conversion failed. Install pymupdf: pip install pymupdf"
        ) from None
