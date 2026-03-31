"""
Patient-facing summary + simple explanations for document OCR text.

This is only used by GET /documents/{id}/explanations. It does not call the
patient RAG chat pipeline and does not write to the vector store.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List


def _truncate(text: str, max_chars: int = 14000) -> str:
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[:max_chars] + "\n\n[... text truncated for processing ...]"


def _fallback_explanations(raw_text: str) -> Dict[str, Any]:
    """Heuristic summary when OpenAI is not configured or request fails."""
    text = (raw_text or "").strip()
    if not text:
        return {"summary": "No text was available to summarize.", "explanations": []}

    chunk = text[:2000]
    sentences = re.split(r"(?<=[.!?])\s+", chunk)
    summary = " ".join(sentences[:3]).strip()
    if len(summary) > 700:
        summary = summary[:700].rsplit(" ", 1)[0] + "..."
    elif len(text) > len(chunk):
        summary += " ..."

    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and len(ln.strip()) > 4]
    explanations: List[str] = []
    for ln in lines[:8]:
        if 25 < len(ln) < 280:
            explanations.append(ln[:240] + ("..." if len(ln) > 240 else ""))

    if not explanations:
        explanations = [
            "This is an automatic excerpt from the document. "
            "For richer summaries, configure OPENAI_API_KEY on the server."
        ]

    return {"summary": summary or "Document content could not be summarized.", "explanations": explanations[:8]}


def generate_summary_and_explanations(raw_text: str) -> Dict[str, Any]:
    """
    Returns {"summary": str, "explanations": list[str]}.
    Standalone from RAG / chat / vector indexing.
    """
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return _fallback_explanations(raw_text)

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        text = _truncate(raw_text)
        user_content = (
            "You are helping a patient understand a health document. Read the extracted text below.\n\n"
            "Return ONLY valid JSON with this exact structure (no markdown, no code fences):\n"
            '{"summary":"<2-5 short sentences in plain language>","explanations":["<bullet 1>","<bullet 2>",...]}\n\n'
            "Use 4-8 items in explanations. Each should explain one important part in simple terms "
            "(dates, tests, medications, instructions, or diagnoses mentioned). "
            "Avoid unexplained jargon.\n\n"
            "Extracted document text:\n---\n"
            + text
        )

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": user_content}],
            temperature=0.2,
            max_tokens=1200,
        )
        raw = (completion.choices[0].message.content or "").strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```\s*$", "", raw)
        data = json.loads(raw)
        summary = str(data.get("summary", "")).strip()
        expl = data.get("explanations", [])
        if isinstance(expl, str):
            expl = [expl]
        explanations = [str(x).strip() for x in expl if str(x).strip()]
        if not summary:
            raise ValueError("empty summary")
        return {"summary": summary, "explanations": explanations}
    except Exception:
        return _fallback_explanations(raw_text)
