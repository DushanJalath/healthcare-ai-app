from __future__ import annotations

from typing import Optional


class GoogleOcrError(RuntimeError):
    pass


def _get_client():
    """
    Lazily create the Vision client so the app can boot even if the dependency
    isn't installed in some environments.

    Auth is handled by Google libraries via GOOGLE_APPLICATION_CREDENTIALS or
    workload identity.
    """
    try:
        from google.cloud import vision  # type: ignore
    except Exception as e:  # pragma: no cover
        raise GoogleOcrError(
            "google-cloud-vision is not installed. Add it to backend/requirements.txt"
        ) from e

    return vision.ImageAnnotatorClient()


def extract_text_google_bytes(
    content: bytes, *, mime_type: Optional[str] = None
) -> str:
    """
    OCR an image (bytes) using Google Vision.

    For best results on medical scans, we use document_text_detection.
    """
    try:
        from google.cloud import vision  # type: ignore
    except Exception as e:  # pragma: no cover
        raise GoogleOcrError(
            "google-cloud-vision is not installed. Add it to backend/requirements.txt"
        ) from e

    client = _get_client()

    image = vision.Image(content=content)
    response = client.document_text_detection(image=image)

    if getattr(response, "error", None) and response.error.message:
        raise GoogleOcrError(response.error.message)

    annotation = getattr(response, "full_text_annotation", None)
    text = getattr(annotation, "text", None) if annotation else None
    if text:
        return text

    # Fallback: classic text_detection annotations (less structured)
    response2 = client.text_detection(image=image)
    if getattr(response2, "error", None) and response2.error.message:
        raise GoogleOcrError(response2.error.message)
    texts = getattr(response2, "text_annotations", None) or []
    return texts[0].description if texts else ""


def extract_text_google(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        content = image_file.read()
    return extract_text_google_bytes(content)

