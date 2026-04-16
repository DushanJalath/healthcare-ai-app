"""
Derive time-series health metrics from stored OCR text on document extractions.

The pipeline currently stores clinical text in ``Extraction.raw_text``; structured
lab/vital JSON columns are not filled. We extract plausible numeric readings with
conservative regexes and bucket them by calendar month for the patient dashboard chart.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import List, Literal, Optional, Tuple

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from ..models.document import Document, DocumentStatus
from ..models.extraction import Extraction, ExtractionStatus

MetricKey = Literal["glucose", "cholesterol", "bp_systolic", "heart_rate", "weight"]


def _ensure_aware(dt: Optional[datetime]) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_glucose(text: str) -> Optional[float]:
    if not text:
        return None
    patterns = [
        r"(?:fasting|random|serum|plasma)?\s*glucose\s*[:(]\s*(\d{2,3}(?:\.\d+)?)\s*(?:mg/?dl)?",
        r"glucose\s*\([^)]{0,40}\)\s*[:(]\s*(\d{2,3}(?:\.\d+)?)\s*(?:mg/?dl)?",
        r"glucose[^:\n]{0,24}:\s*(\d{2,3}(?:\.\d+)?)\s*(?:mg/?dl)?",
        r"blood\s+sugar\s*[:(]\s*(\d{2,3}(?:\.\d+)?)",
        r"\bfbs?\b\s*[:(]\s*(\d{2,3}(?:\.\d+)?)",
        r"\bfbg\b\s*[:(]\s*(\d{2,3}(?:\.\d+)?)",
        r"glucose\s*[:(]\s*(\d{2,3}(?:\.\d+)?)",
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            v = float(m.group(1))
            if 20 <= v <= 600:
                return v
    return None


def _parse_total_cholesterol(text: str) -> Optional[float]:
    """Total cholesterol (mg/dL); avoids LDL/HDL-specific lines."""
    if not text:
        return None
    patterns = [
        r"total\s+cholesterol\s*[:(]\s*(\d{2,3}(?:\.\d+)?)\s*(?:mg/?dl)?",
        r"cholesterol\s+level\s*[:(]\s*(\d{2,3}(?:\.\d+)?)\s*(?:mg/?dl)?",
        r"cholesterol\s*\(\s*total\s*\)\s*[:(]\s*(\d{2,3}(?:\.\d+)?)\s*(?:mg/?dl)?",
        r"serum\s+cholesterol\s*[:(]\s*(\d{2,3}(?:\.\d+)?)\s*(?:mg/?dl)?",
        r"(?:^|[\n\r])\s*TC\s*[:(]\s*(\d{2,3}(?:\.\d+)?)\s*(?:mg/?dl)?",
        r"\bCHOL\b\s*[:(]\s*(\d{2,3}(?:\.\d+)?)\s*(?:mg/?dl)?",
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE | re.MULTILINE)
        if m:
            v = float(m.group(1))
            if 80 <= v <= 600:
                return v
    return None


def _parse_bp_systolic(text: str) -> Optional[float]:
    if not text:
        return None
    patterns = [
        r"blood\s+pressure\s*[:(]\s*(\d{2,3})\s*/\s*\d{2,3}",
        r"\bb\.?p\.?\b\s*[:(]\s*(\d{2,3})\s*/\s*\d{2,3}",
        r"\bBP\s*[:(]\s*(\d{2,3})\s*/\s*\d{2,3}",
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            v = float(m.group(1))
            if 40 <= v <= 260:
                return v
    return None


def _parse_heart_rate(text: str) -> Optional[float]:
    if not text:
        return None
    patterns = [
        r"heart\s+rate\s*[:(]\s*(\d{2,3})\s*(?:bpm)?",
        r"\bpulse\s*[:(]\s*(\d{2,3})\s*(?:bpm)?",
        r"(?:^|\s)HR\s*[:(]\s*(\d{2,3})\s*(?:bpm)?",
        r"heart\s+rate\s+is\s+(\d{2,3})\b",
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            v = float(m.group(1))
            if 25 <= v <= 250:
                return v
    return None


def _parse_weight(text: str) -> Tuple[Optional[float], str]:
    """Returns (value, unit) with unit 'kg' or 'lb' when detectable."""
    if not text:
        return None, "lb"
    m = re.search(
        r"weight\s*[:(]\s*(\d{2,3}(?:\.\d+)?)\s*(kg|kgs|kilograms?|lbs?|pounds?)?",
        text,
        re.IGNORECASE,
    )
    if not m:
        m = re.search(r"\bwt\.?\s*[:(]\s*(\d{2,3}(?:\.\d+)?)\s*(kg|kgs|lbs?)?", text, re.IGNORECASE)
    if not m:
        return None, "lb"
    v = float(m.group(1))
    if v < 15 or v > 500:
        return None, "lb"
    unit_raw = (m.group(2) or "").lower()
    if unit_raw.startswith("kg") or "kilogram" in unit_raw:
        return v, "kg"
    if unit_raw.startswith("lb") or "pound" in unit_raw:
        return v, "lb"
    # Heuristic: small numbers in clinical text are often kg
    if v < 90:
        return v, "kg"
    return v, "lb"


def _parse_metric(text: str, metric: MetricKey) -> Optional[float]:
    if metric == "glucose":
        return _parse_glucose(text)
    if metric == "cholesterol":
        return _parse_total_cholesterol(text)
    if metric == "bp_systolic":
        return _parse_bp_systolic(text)
    if metric == "heart_rate":
        return _parse_heart_rate(text)
    if metric == "weight":
        w, _u = _parse_weight(text)
        return w
    return None


def collect_document_metric_readings(
    db: Session,
    *,
    patient_id: int,
    metric: MetricKey,
    clinic_id: Optional[int] = None,
) -> List[Tuple[datetime, float, str]]:
    """
    Each tuple is (reference_datetime, value, weight_unit).
    For non-weight metrics ``weight_unit`` is an empty string.
    One value per document (first successful parse on that document's OCR text).
    """
    q = (
        db.query(Document, Extraction)
        .join(Extraction, Extraction.document_id == Document.id)
        .filter(
            Document.patient_id == patient_id,
            Document.status == DocumentStatus.PROCESSED,
            Extraction.status == ExtractionStatus.COMPLETED,
            Extraction.raw_text.isnot(None),
        )
    )
    if clinic_id is not None:
        q = q.filter(Document.clinic_id == clinic_id)

    rows: List[Tuple[datetime, float, str]] = []
    for doc, ext in q.all():
        text = (ext.raw_text or "").strip()
        if not text:
            continue
        w_unit = ""
        if metric == "weight":
            val, w_unit = _parse_weight(text)
        else:
            val = _parse_metric(text, metric)
        if val is None:
            continue
        ref = ext.completed_at or doc.processed_date or doc.upload_date
        ref = _ensure_aware(ref)
        rows.append((ref, float(val), w_unit))
    rows.sort(key=lambda x: x[0])
    return rows


def build_monthly_points(
    readings: List[Tuple[datetime, float, str]],
    *,
    num_months: int = 6,
    metric: MetricKey,
) -> Tuple[List[dict], Optional[float], str]:
    """
    Returns (points for chart, latest_value in window, weight_unit_hint).
    ``weight_unit_hint`` is ``kg`` or ``lb`` (for weight only; otherwise ``lb`` unused).
    """
    if not readings:
        return [], None, "lb"

    now = datetime.now(timezone.utc)
    start_current = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    window_start = start_current - relativedelta(months=num_months - 1)

    in_window = [(dt, val, u) for dt, val, u in readings if dt >= window_start]
    if not in_window:
        return [], None, "lb"

    latest_row = max(in_window, key=lambda x: x[0])
    latest_val = latest_row[1]
    weight_unit = latest_row[2] if metric == "weight" and latest_row[2] else "lb"

    points: List[dict] = []
    for i in range(num_months - 1, -1, -1):
        mstart = start_current - relativedelta(months=i)
        mend = mstart + relativedelta(months=1)
        label = mstart.strftime("%b")
        month_key = mstart.strftime("%Y-%m")
        in_month = [(dt, val) for dt, val, _u in in_window if mstart <= dt < mend]
        if not in_month:
            continue
        _dt, val = max(in_month, key=lambda x: x[0])
        display = round(val, 1) if metric == "weight" else round(val)
        points.append({"label": label, "value": float(display), "month_key": month_key})

    return points, float(round(latest_val, 1) if metric == "weight" else round(latest_val)), weight_unit
