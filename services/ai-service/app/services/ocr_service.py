"""
OCR Service — Gemini 2.5 Flash vision (primary) + regex fallback.

Gemini 2.5 Flash takes the image directly — no Google Cloud credentials needed.
It reads handwritten and printed text including Devanagari, Tamil, Telugu,
Gujarati, Kannada, Malayalam, Bengali, and mixed Hindi+English scripts.

Pipeline:
  1. preprocess_image   — PIL enhance contrast/sharpness
  2. parse_ocr_text     — Gemini 2.5 Flash image → structured JSON
                          (falls back to regex if GEMINI_API_KEY not set)
  3. match_to_catalog   — exact match, then rapidfuzz fuzzy match
"""
from __future__ import annotations

import base64
import io
import json
import logging
import re
from typing import Any, Literal

import httpx

from app.core.config import settings
from app.clients.inventory_client import get_item_names

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL   = (
    f"https://generativelanguage.googleapis.com/v1beta/models"
    f"/{GEMINI_MODEL}:generateContent"
)

# ── Image preprocessing ────────────────────────────────────────────────────────

def preprocess_image(image_bytes: bytes) -> bytes:
    """Enhance contrast and sharpness for better OCR accuracy."""
    from PIL import Image, ImageEnhance, ImageFilter

    if not image_bytes:
        raise ValueError("image_bytes cannot be empty")

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = ImageEnhance.Contrast(img).enhance(1.8)
    img = ImageEnhance.Sharpness(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


# ── Gemini 2.5 Flash vision ────────────────────────────────────────────────────

NOTEBOOK_PROMPT = """\
You are a restaurant inventory assistant reading a handwritten or printed notebook image.

The notebook may contain:
- Item names in Hindi, English, or a mix (e.g. "Tamatar", "Tomatoes", "प्याज")
- Quantities in Indian units: kg, g, gm, litre, L, pcs, dozen, pav (=250g), packet
- Prices in rupees (₹ or Rs.)
- Dates in DD/MM/YYYY or DD-MM-YY format

Extract every line item. Return ONLY valid JSON:
{
  "items": [
    {
      "name": "string (translate to English if in Hindi/regional language)",
      "quantity": number or null,
      "unit": "string or null",
      "cost_per_unit": number or null,
      "date": "YYYY-MM-DD or null",
      "notes": "string or null"
    }
  ],
  "expenses": [],
  "confidence": 0.0 to 1.0,
  "unreadable_sections": ["describe any illegible parts"]
}
"""

EXPENSE_PROMPT = """\
You are a restaurant accounting assistant reading a handwritten or printed expense notebook.

The notebook may contain supplier bills, daily expenses, petty cash entries.
Amounts are in Indian Rupees (₹ or Rs.).

Extract every expense entry. Return ONLY valid JSON:
{
  "items": [],
  "expenses": [
    {
      "description": "string",
      "amount": number or null,
      "payee": "string or null",
      "date": "YYYY-MM-DD or null"
    }
  ],
  "confidence": 0.0 to 1.0,
  "unreadable_sections": ["describe any illegible parts"]
}
"""


def _gemini_vision_parse(
    image_bytes: bytes,
    context_type: Literal["inventory", "expense"],
) -> dict[str, Any]:
    """Send image directly to Gemini 2.5 Flash and get structured JSON back."""
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    prompt = NOTEBOOK_PROMPT if context_type == "inventory" else EXPENSE_PROMPT

    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
            ]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
        },
    }

    response = httpx.post(
        f"{GEMINI_URL}?key={settings.gemini_api_key}",
        json=payload,
        timeout=30,
    )
    response.raise_for_status()

    body    = response.json()
    content = body["candidates"][0]["content"]["parts"][0]["text"]
    parsed  = json.loads(content)

    parsed.setdefault("items", [])
    parsed.setdefault("expenses", [])
    parsed.setdefault("confidence", 0.7)
    parsed.setdefault("unreadable_sections", [])
    return parsed


# ── Regex fallback (no API key needed) ────────────────────────────────────────

_UNIT_RE = r"(kg|kgs|g|gm|gms|litre|litres|liter|l|lt|ltr|ml|pcs|pc|piece|pieces|nos|dozen|pkt|packet|box|bottle|tin|bag)"
_QTY_RE  = r"(\d+(?:\.\d+)?)"

LINE_PATTERN = re.compile(
    rf"^(.+?)\s*[:\-–]?\s*{_QTY_RE}\s*{_UNIT_RE}(?:\s*[@₹rs\.]*\s*(\d+(?:\.\d+)?))?",
    re.IGNORECASE,
)

EXPENSE_LINE = re.compile(
    r"^(.+?)\s*[:\-–]?\s*(?:rs\.?|₹)?\s*(\d[\d,]*\.?\d*)",
    re.IGNORECASE,
)


def _regex_parse(
    raw_text: str,
    context_type: Literal["inventory", "expense"],
) -> dict[str, Any]:
    lines    = [l.strip() for l in raw_text.splitlines() if l.strip()]
    items: list[dict] = []
    expenses: list[dict] = []
    unreadable: list[str] = []

    for line in lines:
        if context_type == "inventory":
            m = LINE_PATTERN.match(line)
            if m:
                items.append({
                    "name": m.group(1).strip().title(),
                    "quantity": float(m.group(2)),
                    "unit": m.group(3).lower(),
                    "cost_per_unit": float(m.group(4)) if m.group(4) else None,
                    "date": None, "notes": None,
                })
            else:
                unreadable.append(line)
        else:
            m = EXPENSE_LINE.match(line)
            if m:
                expenses.append({
                    "description": m.group(1).strip().title(),
                    "amount": float(m.group(2).replace(",", "")),
                    "payee": None, "date": None,
                })
            else:
                unreadable.append(line)

    total  = len(lines)
    parsed = len(items) + len(expenses)
    return {
        "items": items, "expenses": expenses,
        "confidence": round(parsed / total, 2) if total else 0.0,
        "unreadable_sections": unreadable,
    }


# ── Public entry point ─────────────────────────────────────────────────────────

def parse_ocr_text(
    raw_text: str,
    context_type: Literal["inventory", "expense"],
    known_items: list[str],
    image_bytes: bytes | None = None,
) -> dict[str, Any]:
    """Parse OCR input.

    If image_bytes provided and GEMINI_API_KEY is set → Gemini vision (best).
    Else if raw_text and GEMINI_API_KEY → Gemini text-only parse.
    Else → regex fallback.
    """
    if image_bytes and settings.gemini_api_key:
        try:
            return _gemini_vision_parse(image_bytes, context_type)
        except Exception as exc:
            logger.warning("Gemini vision parse failed (%s), trying text parse", exc)

    if raw_text.strip() and settings.gemini_api_key:
        try:
            return _parse_with_gemini_text(raw_text, context_type, known_items)
        except Exception as exc:
            logger.warning("Gemini text parse failed (%s), using regex fallback", exc)

    return _regex_parse(raw_text, context_type)


def _parse_with_gemini_text(
    raw_text: str,
    context_type: Literal["inventory", "expense"],
    known_items: list[str],
) -> dict[str, Any]:
    """Send extracted text (not image) to Gemini for structured parsing."""
    item_list = ", ".join(known_items[:50]) if known_items else "none"
    prompt = (
        NOTEBOOK_PROMPT if context_type == "inventory" else EXPENSE_PROMPT
    ) + f"\n\nKnown catalog items: {item_list}\n\nText to parse:\n{raw_text}"

    response = httpx.post(
        f"{GEMINI_URL}?key={settings.gemini_api_key}",
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
        },
        timeout=20,
    )
    response.raise_for_status()
    body    = response.json()
    content = body["candidates"][0]["content"]["parts"][0]["text"]
    parsed  = json.loads(content)
    parsed.setdefault("items", [])
    parsed.setdefault("expenses", [])
    parsed.setdefault("confidence", 0.6)
    parsed.setdefault("unreadable_sections", [])
    return parsed


# ── Catalog matching ───────────────────────────────────────────────────────────

async def match_to_catalog(
    extracted_items: list[dict[str, Any]],
    tenant_id: str,
) -> dict[str, Any]:
    """Match extracted names to tenant catalog using exact + rapidfuzz."""
    catalog_names: list[str] = []
    try:
        catalog_names = await get_item_names(tenant_id)
    except Exception as exc:
        logger.warning("Could not fetch catalog for tenant %s: %s", tenant_id, exc)

    catalog_lower = {name.lower(): name for name in catalog_names}
    matched: list[dict] = []
    unmatched: list[dict] = []

    for item in extracted_items:
        name = (item.get("name") or "").strip()
        if not name:
            unmatched.append({**item, "reason": "empty name"})
            continue

        if name.lower() in catalog_lower:
            matched.append({**item, "catalog_name": catalog_lower[name.lower()],
                            "match_type": "exact", "match_confidence": 1.0})
            continue

        if catalog_names:
            best_name, score = _fuzzy_best(name, catalog_names)
            if score >= 85:
                matched.append({**item, "catalog_name": best_name,
                                "match_type": "fuzzy",
                                "match_confidence": round(score / 100, 2)})
            else:
                unmatched.append({**item,
                                  "reason": f"no match (best: {best_name!r}, score={score})"})
        else:
            unmatched.append({**item, "reason": "catalog unavailable"})

    return {"matched": matched, "unmatched": unmatched}


def _fuzzy_best(query: str, choices: list[str]) -> tuple[str, float]:
    try:
        from rapidfuzz import process as rfp, fuzz
        result = rfp.extractOne(query, choices, scorer=fuzz.WRatio)
        if result:
            return result[0], result[1]
    except ImportError:
        from difflib import get_close_matches, SequenceMatcher
        matches = get_close_matches(query.lower(), [c.lower() for c in choices], n=1, cutoff=0.6)
        if matches:
            idx   = [c.lower() for c in choices].index(matches[0])
            ratio = SequenceMatcher(None, query.lower(), matches[0]).ratio() * 100
            return choices[idx], ratio
    return choices[0] if choices else "", 0.0
