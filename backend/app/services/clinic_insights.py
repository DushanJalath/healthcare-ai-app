from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.document import Document, DocumentStatus
from ..models.medical_history import MedicalEntryStatus, MedicalHistoryEntry
from ..models.patient_clinic import PatientClinic
from ..models.patient_document_condition import PatientDocumentCondition

logger = logging.getLogger(__name__)

# Do not report exact small counts (re-identification risk).
PRIVACY_COUNT_THRESHOLD = 5


@dataclass
class ClassifiedIntent:
    intent: str
    condition_query: Optional[str] = None
    active_entries_only: bool = True
    # Extra phrases to OR-match in DB (e.g. diabetic + diabetes)
    search_aliases: List[str] = field(default_factory=list)
    # Natural wording for replies (e.g. diabetes for "sugar patients")
    friendly_topic: Optional[str] = None


def _format_count(n: int) -> str:
    if n <= 0:
        return "0"
    if 0 < n < PRIVACY_COUNT_THRESHOLD:
        return f"fewer than {PRIVACY_COUNT_THRESHOLD}"
    return str(n)


def _privacy_suffix() -> str:
    return " For privacy, exact counts below five are not displayed."


def _condition_search_terms(classified: ClassifiedIntent) -> List[str]:
    parts: List[str] = []
    if classified.condition_query:
        parts.append(classified.condition_query)
    parts.extend(classified.search_aliases or [])
    seen: set[str] = set()
    out: List[str] = []
    for p in parts:
        s = p.strip()
        if len(s) < 2:
            continue
        k = s.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(s)
    return out


def classify_clinic_question(
    question: str,
    chat_history: Optional[List[Dict[str, Any]]] = None,
) -> ClassifiedIntent:
    """
    Use OpenAI JSON mode to map the user message to a safe intent.
    Falls back to light heuristics if the API is unavailable.
    """
    q = question.strip()
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if api_key:
        try:
            ctx = ""
            if chat_history:
                tail = [
                    t
                    for t in chat_history[-4:]
                    if (t.get("role") in ("user", "assistant") and (t.get("content") or "").strip())
                ]
                if tail:
                    lines = [
                        f'{t["role"]}: {(t.get("content") or "").strip()[:500]}'
                        for t in tail
                    ]
                    ctx = "Recent conversation (for context):\n" + "\n".join(lines) + "\n\n"
            client = OpenAI(api_key=api_key)
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You classify questions from clinic staff about their clinic. "
                            "Return a JSON object with keys: "
                            'intent (one of: count_enrolled, count_condition, request_names, '
                            'count_processed_documents, general_help), '
                            'condition_query (canonical English term to search in records, or null), '
                            'search_aliases (optional array of extra short phrases to also match, e.g. '
                            '["diabetic"] with condition_query "diabetes"), '
                            'friendly_topic (short phrase for natural replies, e.g. "diabetes" when user says '
                            '"sugar patients"; same as condition_query if unclear), '
                            'active_entries_only (boolean, true if they mean current/ongoing diagnoses). '
                            "Map common informal phrases to standard clinical terms for searching: "
                            "e.g. sugar patients / no-sugar diet patients in a counting context → diabetes; "
                            "high blood pressure → hypertension. "
                            "If the user asks for patient names, lists of patients, or who specifically, "
                            "use intent request_names. "
                            "For 'how many patients have X' use count_condition. "
                            "For total patients enrolled use count_enrolled."
                        ),
                    },
                    {"role": "user", "content": f"{ctx}Latest staff message:\n{q}"},
                ],
            )
            raw = completion.choices[0].message.content or "{}"
            data = json.loads(raw)
            intent = str(data.get("intent") or "general_help")
            cq = data.get("condition_query")
            condition_query = str(cq).strip() if cq else None
            active = bool(data.get("active_entries_only", True))
            aliases_raw = data.get("search_aliases")
            search_aliases: List[str] = []
            if isinstance(aliases_raw, list):
                for a in aliases_raw:
                    if isinstance(a, str) and len(a.strip()) >= 2:
                        search_aliases.append(a.strip()[:120])
            ft = data.get("friendly_topic")
            friendly_topic = str(ft).strip() if ft else None
            if intent not in (
                "count_enrolled",
                "count_condition",
                "request_names",
                "count_processed_documents",
                "general_help",
            ):
                intent = "general_help"
            return ClassifiedIntent(
                intent=intent,
                condition_query=condition_query,
                active_entries_only=active,
                search_aliases=search_aliases,
                friendly_topic=friendly_topic or condition_query,
            )
        except Exception as e:
            logger.warning("OpenAI intent classification failed, using heuristics: %s", e)

    low = q.lower()
    if any(
        w in low
        for w in ("who are", "list of patient", "names of", "patient names", "which patients")
    ):
        return ClassifiedIntent(intent="request_names")
    if "how many patient" in low or "number of patient" in low:
        if "enroll" in low or "registered" in low or "total patient" in low:
            return ClassifiedIntent(intent="count_enrolled")
        m = re.search(
            r"(?:with|have|has|diagnos\w*\s+with)\s+([^?.!]+?)(?:\?|$|\.|!)",
            low,
            re.I,
        )
        term = (m.group(1).strip() if m else "") or ""
        term = re.sub(r"^(the|a|an)\s+", "", term)
        if len(term) >= 2:
            sugar = "sugar" in low and "patient" in low
            return ClassifiedIntent(
                intent="count_condition",
                condition_query="diabetes" if sugar else term[:120],
                active_entries_only="ever" not in low and "history" not in low,
                search_aliases=(["diabetic", "diabetes mellitus"] if sugar else []),
                friendly_topic="diabetes" if sugar else term[:120],
            )
    if "sugar" in low and "patient" in low:
        return ClassifiedIntent(
            intent="count_condition",
            condition_query="diabetes",
            search_aliases=["diabetic", "diabetes mellitus"],
            friendly_topic="diabetes",
            active_entries_only=True,
        )
    return ClassifiedIntent(intent="general_help")


def count_enrolled_patients(db: Session, clinic_id: int) -> int:
    return (
        db.query(func.count(PatientClinic.id))
        .filter(
            PatientClinic.clinic_id == clinic_id,
            PatientClinic.is_active.is_(True),
        )
        .scalar()
        or 0
    )


def count_patients_with_condition(
    db: Session,
    clinic_id: int,
    search_terms: List[str],
    *,
    active_entries_only: bool,
) -> int:
    terms: List[str] = []
    for raw in search_terms:
        t = re.sub(r"[%_\\]+", " ", raw.strip()).strip()
        if len(t) >= 2:
            terms.append(t)
    seen: set[str] = set()
    uniq: List[str] = []
    for t in terms:
        k = t.lower()
        if k not in seen:
            seen.add(k)
            uniq.append(t)
    terms = uniq
    if not terms:
        return 0

    enrolled_subq = (
        db.query(PatientClinic.patient_id.label("pid"))
        .filter(
            PatientClinic.clinic_id == clinic_id,
            PatientClinic.is_active.is_(True),
        )
        .subquery()
    )

    hist_predicates = []
    for term in terms:
        hist_predicates.append(MedicalHistoryEntry.condition.ilike(f"%{term}%"))
        hist_predicates.append(MedicalHistoryEntry.title.ilike(f"%{term}%"))

    hist_q = (
        db.query(MedicalHistoryEntry.patient_id.label("pid"))
        .join(enrolled_subq, MedicalHistoryEntry.patient_id == enrolled_subq.c.pid)
        .filter(or_(*hist_predicates))
    )
    if active_entries_only:
        hist_q = hist_q.filter(
            MedicalHistoryEntry.status.in_(
                (MedicalEntryStatus.ONGOING, MedicalEntryStatus.CHRONIC)
            )
        )

    doc_predicates = [
        PatientDocumentCondition.condition_label.ilike(f"%{term}%") for term in terms
    ]
    doc_q = (
        db.query(PatientDocumentCondition.patient_id.label("pid"))
        .join(enrolled_subq, PatientDocumentCondition.patient_id == enrolled_subq.c.pid)
        .join(Document, Document.id == PatientDocumentCondition.document_id)
        .filter(or_(*doc_predicates))
        .filter(
            or_(
                Document.clinic_id == clinic_id,
                Document.clinic_id.is_(None),
            )
        )
    )

    combined = hist_q.union(doc_q).subquery()
    return int(db.query(func.count()).select_from(combined).scalar() or 0)


def count_processed_documents(db: Session, clinic_id: int) -> int:
    return (
        db.query(func.count(Document.id))
        .filter(
            Document.clinic_id == clinic_id,
            Document.status == DocumentStatus.PROCESSED,
        )
        .scalar()
        or 0
    )


def _collect_reply_facts(
    db: Session,
    clinic_id: int,
    clinic_name: Optional[str],
    classified: ClassifiedIntent,
) -> Dict[str, Any]:
    label = clinic_name or "your clinic"

    if classified.intent == "request_names":
        return {"kind": "request_names", "clinic": label}

    if classified.intent == "count_enrolled":
        n = count_enrolled_patients(db, clinic_id)
        disp = _format_count(n)
        is_exact = n == 0 or n >= PRIVACY_COUNT_THRESHOLD
        return {
            "kind": "enrolled_count",
            "clinic": label,
            "count_phrase": disp,
            "count_is_exact": is_exact,
            "raw_band_small": bool(0 < n < PRIVACY_COUNT_THRESHOLD),
        }

    if classified.intent == "count_processed_documents":
        n = count_processed_documents(db, clinic_id)
        return {
            "kind": "processed_documents",
            "clinic": label,
            "count": n,
            "count_phrase": str(n),
        }

    if classified.intent == "count_condition":
        if not classified.condition_query:
            return {"kind": "need_condition", "clinic": label}
        terms = _condition_search_terms(classified)
        if not terms:
            return {"kind": "need_condition", "clinic": label}
        n = count_patients_with_condition(
            db,
            clinic_id,
            terms,
            active_entries_only=classified.active_entries_only,
        )
        disp = _format_count(n)
        is_exact = n == 0 or n >= PRIVACY_COUNT_THRESHOLD
        topic = (classified.friendly_topic or classified.condition_query or "that condition").strip()
        return {
            "kind": "condition_count",
            "clinic": label,
            "count_phrase": disp,
            "count_is_exact": is_exact,
            "raw_band_small": bool(0 < n < PRIVACY_COUNT_THRESHOLD),
            "topic": topic,
            "scope_ongoing_only": classified.active_entries_only,
        }

    return {"kind": "general_help", "clinic": label}


def _conversational_fallback(_question: str, facts: Dict[str, Any]) -> str:
    kind = facts.get("kind")
    label = facts.get("clinic", "your clinic")
    if kind == "request_names":
        return (
            "I can only share aggregate numbers for your clinic, not names or patient lists—that keeps things private."
        )
    if kind == "enrolled_count":
        cp = facts.get("count_phrase", "0")
        extra = _privacy_suffix().strip() if facts.get("raw_band_small") else ""
        base = f"Right now, {label} has {cp} patients actively enrolled."
        return f"{base} {extra}".strip() if extra else base
    if kind == "processed_documents":
        return f"{label} has {facts.get('count_phrase', '0')} documents that are fully analyzed."
    if kind == "condition_count":
        cp = facts.get("count_phrase", "0")
        topic = facts.get("topic", "that condition")
        extra = _privacy_suffix().strip() if facts.get("raw_band_small") else ""
        if cp == "0":
            msg = (
                f"I'm not seeing any enrolled patients at {label} with {topic} in the records we count "
                f"(active problems in the chart plus conditions from analyzed uploads)."
            )
            return f"{msg} {extra}".strip() if extra else msg
        msg = f"For {label}, there are {cp} enrolled patient(s) with {topic} on file."
        return f"{msg} {extra}".strip() if extra else msg
    if kind == "need_condition":
        return (
            "Sure—which condition should I look for? "
            'For example: "How many patients have diabetes?"'
        )
    return (
        f"I can help with totals for {label}, like enrollments or how many patients have a condition on record. "
        "What would you like to know?"
    )


def _compose_natural_language_answer(
    user_question: str,
    facts: Dict[str, Any],
    chat_history: Optional[List[Dict[str, Any]]],
) -> str:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return _conversational_fallback(user_question, facts)

    try:
        client = OpenAI(api_key=api_key)
        history_msgs: List[Dict[str, str]] = []
        if chat_history:
            for turn in chat_history[-8:]:
                role = turn.get("role")
                content = (turn.get("content") or "").strip()
                if role not in ("user", "assistant") or not content:
                    continue
                history_msgs.append({"role": str(role), "content": content})

        messages: List[Dict[str, str]] = [
            {
                "role": "system",
                "content": (
                    "You are a warm, professional assistant for clinic staff using MediKeep. "
                    "Reply in natural conversational English (1–3 short sentences unless they asked for detail). "
                    "Do not sound robotic or like a database report.\n\n"
                    "Strict rules:\n"
                    "- Use ONLY aggregate facts from the FACTS JSON. Never invent numbers or patient identities.\n"
                    "- Never name, list, or hint at individual patients.\n"
                    "- If count_is_exact is false, use exactly count_phrase for the total (e.g. 'fewer than 5') "
                    "and do not state a different specific integer.\n"
                    "- Mirror informal wording kindly when it matches the topic (e.g. sugar patients → diabetes).\n"
                    "- For general_help, briefly say what you can count and invite a concrete question."
                ),
            }
        ]
        messages.extend(history_msgs)
        facts_json = json.dumps(facts, ensure_ascii=False)
        messages.append(
            {
                "role": "user",
                "content": (
                    f"FACTS (authoritative, do not change):\n{facts_json}\n\n"
                    f"STAFF_MESSAGE:\n{user_question.strip()}\n\nWrite the assistant reply."
                ),
            }
        )
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.45,
            max_tokens=220,
            messages=messages,
        )
        text = (completion.choices[0].message.content or "").strip()
        if text:
            return text
    except Exception as e:
        logger.warning("Clinic insights conversational compose failed: %s", e)
    return _conversational_fallback(user_question, facts)


def run_clinic_insights_chat(
    db: Session,
    clinic_id: int,
    clinic_name: Optional[str],
    question: str,
    chat_history: Optional[List[Dict[str, Any]]],
) -> Tuple[str, ClassifiedIntent]:
    classified = classify_clinic_question(question, chat_history)
    facts = _collect_reply_facts(db, clinic_id, clinic_name, classified)
    answer = _compose_natural_language_answer(
        user_question=question,
        facts=facts,
        chat_history=chat_history,
    )
    return answer, classified
