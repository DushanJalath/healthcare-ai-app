"""Derive medication text from medical history entries that are active on a given date."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Dict, List, Optional, Sequence

from sqlalchemy import or_, desc
from sqlalchemy.orm import Session

from ..models.medical_history import MedicalHistoryEntry


def active_treatment_medication_summaries_by_patient(
    db: Session,
    patient_ids: Sequence[int],
    as_of: Optional[date] = None,
) -> Dict[int, str]:
    """
    For each patient ID, build a readable block of medications from treatment history
    rows where ``start_date <= as_of`` and (``end_date`` is null or ``end_date >= as_of``),
    and the entry has non-empty ``medications`` text.
    """
    if not patient_ids:
        return {}
    as_of = as_of or date.today()
    entries: List[MedicalHistoryEntry] = (
        db.query(MedicalHistoryEntry)
        .filter(
            MedicalHistoryEntry.patient_id.in_(list(patient_ids)),
            MedicalHistoryEntry.start_date <= as_of,
            or_(MedicalHistoryEntry.end_date.is_(None), MedicalHistoryEntry.end_date >= as_of),
        )
        .order_by(MedicalHistoryEntry.patient_id, desc(MedicalHistoryEntry.start_date))
        .all()
    )
    grouped: Dict[int, List[MedicalHistoryEntry]] = defaultdict(list)
    for entry in entries:
        if not (entry.medications or "").strip():
            continue
        grouped[entry.patient_id].append(entry)
    out: Dict[int, str] = {}
    for pid, elist in grouped.items():
        lines: List[str] = []
        for e in elist:
            med = (e.medications or "").strip()
            start_s = e.start_date.isoformat() if e.start_date else ""
            end_s = e.end_date.isoformat() if e.end_date else "present"
            lines.append(f"• {e.title} ({start_s}–{end_s}): {med}")
        out[pid] = "\n".join(lines)
    return out
