from __future__ import annotations

import json
import logging
import os
import re
from typing import List, Optional

from openai import OpenAI
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_MAX_CHARS = 12000
_MAX_LABEL_LEN = 512
_MAX_ITEMS = 40


def extract_condition_labels_from_clinical_text(text: Optional[str]) -> List[str]:
    """
    Use OpenAI JSON mode to list diagnosis / problem phrases found in clinical document text.
    Returns short English labels suitable for aggregate search (no fixed taxonomy).
    """
    raw = (text or "").strip()
    if len(raw) < 20:
        return []

    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        logger.warning("Skipping document condition extraction: OPENAI_API_KEY not set")
        return []

    snippet = raw if len(raw) <= _MAX_CHARS else raw[:_MAX_CHARS] + "\n...[truncated]"

    client = OpenAI(api_key=api_key)
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You extract medical conditions and diagnoses mentioned in clinical text. "
                    'Return JSON: {"conditions": ["...", ...]} '
                    "Each item is a short English phrase (e.g. Hypertension, Type 2 diabetes). "
                    "Include problems explicitly stated as diagnoses, past medical history, "
                    "or active conditions. Do not list isolated lab values or vitals unless clearly "
                    "named as a condition (e.g. Hypertension). "
                    f"At most {_MAX_ITEMS} items. Do not invent conditions not supported by the text. "
                    "Do not copy patient names or identifiers into the list."
                ),
            },
            {"role": "user", "content": snippet},
        ],
    )
    payload = completion.choices[0].message.content or "{}"
    data = json.loads(payload)
    items = data.get("conditions")
    if not isinstance(items, list):
        return []
    out: List[str] = []
    for x in items:
        if isinstance(x, str):
            s = re.sub(r"\s+", " ", x).strip()
            if len(s) >= 2:
                out.append(s[:_MAX_LABEL_LEN])
        elif isinstance(x, dict):
            for key in ("label", "name", "description", "condition"):
                v = x.get(key)
                if isinstance(v, str) and v.strip():
                    s = re.sub(r"\s+", " ", v).strip()
                    if len(s) >= 2:
                        out.append(s[:_MAX_LABEL_LEN])
                    break
    return out


def persist_extracted_document_conditions(
    db: Session,
    *,
    patient_id: Optional[int],
    document_id: int,
    extraction_id: int,
    raw_text: Optional[str],
) -> None:
    """
    Replace all stored conditions for this document with a fresh extraction from raw_text.
    No-op if there is no patient. On LLM failure, leaves existing rows unchanged.
    """
    from ..models.extraction import Extraction
    from ..models.patient_document_condition import PatientDocumentCondition

    if not patient_id:
        return

    try:
        labels = extract_condition_labels_from_clinical_text(raw_text)
    except Exception:
        logger.exception(
            "Document condition LLM extraction failed document_id=%s extraction_id=%s",
            document_id,
            extraction_id,
        )
        return

    db.query(PatientDocumentCondition).filter(
        PatientDocumentCondition.document_id == document_id
    ).delete(synchronize_session=False)

    seen: set[str] = set()
    rows: List[PatientDocumentCondition] = []
    for label in labels:
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            PatientDocumentCondition(
                patient_id=patient_id,
                document_id=document_id,
                extraction_id=extraction_id,
                condition_label=label,
            )
        )

    db.add_all(rows)

    extraction = db.query(Extraction).filter(Extraction.id == extraction_id).first()
    if extraction:
        extraction.diagnoses = {
            "conditions_extracted": [r.condition_label for r in rows],
            "source": "document_ocr_llm",
        }
