"""
OCR Service — handwritten notebook scanning pipeline.

Pipeline:
  1. preprocess_image   — PIL enhance for OCR accuracy
  2. extract_text       — Google Cloud Vision document_text_detection
  3. parse_ocr_text     — regex line parser + optional Gemini Flash refinement
  4. match_to_catalog   — exact match first, then rapidfuzz for fuzzy matching
"""
from __future__ import annotations

import io
import json
import logging
import re
from typing import Any, Literal

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.clients.inventory_client import get_item_names


# ── Image preprocessing ────────────────────────────────────────────────────────

def preprocess_image(image_bytes: bytes) -> bytes:
    """Convert to grayscale, enhance contrast + sharpness for better OCR."""
    from PIL import Image, ImageEnhance, ImageFilter

    if not image_bytes:
        raise ValueError("image_bytes cannot be empty")

    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    img = ImageEnhance.Contrast(img).enhance(2.0)
    img = ImageEnhance.Sharpness(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


# ── Google Cloud Vision OCR ────────────────────────────────────────────────────

def extract_text(image_bytes: bytes) -> str:
    """Run Google Cloud Vision document_text_detection.

    Handles printed and handwritten text including Devanagari, Tamil, Telugu,
    Gujarati, Kannada, Malayalam, Bengali scripts.
    """
    from google.cloud import vision as gcv

    client = gcv.ImageAnnotatorClient()
    image = gcv.Image(content=image_bytes)
    response = client.document_text_detection(image=image)

    if response.error.message:
        raise RuntimeError(f"Google Vision error: {response.error.message}")

    if response.full_text_annotation:
        return response.full_text_annotation.text
    return ""


# ── Structured text parsing ────────────────────────────────────────────────────

# Regex patterns for common inventory notebook line formats:
# "Tomatoes  2 kg  ₹40"
# "Onions: 5 kg"
# "Chicken - 3 kg @ 280"
# "Paneer 500g"

_UNIT_RE = r"(kg|kgs|kilo|g|gm|gms|gram|grams|l|lt|ltr|litre|litres|liter|liters|ml|pcs|pc|piece|pieces|nos|dozen|pkt|packet|box|bottle|tin|bag)"
_QTY_RE  = r"(\d+(?:\.\d+)?)"
_PRICE_RE = r"(?:[@₹rs\.]+\s*)?(\d+(?:\.\d+)?)"

LINE_PATTERN = re.compile(
    rf"^(.+?)\s*[:\-–]?\s*{_QTY_RE}\s*{_UNIT_RE}(?:\s*{_PRICE_RE})?",
    re.IGNORECASE,
)

EXPENSE_PATTERN = re.compile(
    rf"^(.+?)\s*[:\-–]?\s*(?:rs\.?|₹)?\s*{_QTY_RE}",
    re.IGNORECASE,
)


def parse_ocr_text(
    raw_text: str,
    context_type: Literal["inventory", "expense"],
    known_items: list[str],
) -> dict[str, Any]:
    """Parse raw OCR text into structured items using regex.

    If GEMINI_API_KEY is configured, sends the raw text to Gemini Flash for
    improved accuracy on ambiguous/handwritten entries. Falls back to regex
    if Gemini is unavailable.
    """
    # Try Gemini if configured
    if settings.gemini_api_key:
        try:
            return _parse_with_gemini(raw_text, context_type, known_items)
        except Exception as exc:
            logger.warning("Gemini parse failed (%s), falling back to regex", exc)

    return _parse_with_regex(raw_text, context_type)


def _parse_with_regex(
    raw_text: str,
    context_type: Literal["inventory", "expense"],
) -> dict[str, Any]:
    """Rule-based line-by-line parser."""
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    items: list[dict[str, Any]] = []
    expenses: list[dict[str, Any]] = []
    unreadable: list[str] = []

    for line in lines:
        if context_type == "inventory":
            m = LINE_PATTERN.match(line)
            if m:
                name, qty, unit, price = m.group(1), m.group(2), m.group(3), m.group(4)
                items.append({
                    "name": name.strip().title(),
                    "quantity": float(qty),
                    "unit": unit.lower(),
                    "cost_per_unit": float(price) if price else None,
                    "date": None,
                    "notes": None,
                })
            else:
                unreadable.append(line)
        else:
            m = EXPENSE_PATTERN.match(line)
            if m:
                expenses.append({
                    "description": m.group(1).strip().title(),
                    "amount": float(m.group(2)),
                    "payee": None,
                    "date": None,
                })
            else:
                unreadable.append(line)

    total = len(lines)
    parsed = len(items) + len(expenses)
    confidence = round(parsed / total, 2) if total > 0 else 0.0

    return {
        "items": items,
        "expenses": expenses,
        "confidence": confidence,
        "unreadable_sections": unreadable,
    }


def _parse_with_gemini(
    raw_text: str,
    context_type: Literal["inventory", "expense"],
    known_items: list[str],
) -> dict[str, Any]:
    """Parse OCR text using Gemini Flash (free tier, 15 rpm)."""
    import httpx

    item_list = ", ".join(known_items[:50]) if known_items else "none"

    if context_type == "inventory":
        prompt = (
            "You are a restaurant inventory assistant. Extract items from this handwritten "
            f"notebook text. Known catalog items: {item_list}. "
            "Return JSON: {\"items\": [{\"name\", \"quantity\", \"unit\", \"cost_per_unit\", \"date\", \"notes\"}], "
            "\"confidence\": 0.0-1.0, \"unreadable_sections\": []}.\n\n"
            f"Text:\n{raw_text}"
        )
    else:
        prompt = (
            "You are a restaurant accounting assistant. Extract expense entries from this text. "
            "Return JSON: {\"expenses\": [{\"description\", \"amount\", \"payee\", \"date\"}], "
            "\"confidence\": 0.0-1.0, \"unreadable_sections\": []}.\n\n"
            f"Text:\n{raw_text}"
        )

    response = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.gemini_api_key}",
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
        },
        timeout=20,
    )
    response.raise_for_status()

    body = response.json()
    content = body["candidates"][0]["content"]["parts"][0]["text"]
    parsed = json.loads(content)

    # Ensure both keys present
    parsed.setdefault("items", [])
    parsed.setdefault("expenses", [])
    parsed.setdefault("confidence", 0.5)
    parsed.setdefault("unreadable_sections", [])
    return parsed


# ── Catalog matching ───────────────────────────────────────────────────────────

async def match_to_catalog(
    extracted_items: list[dict[str, Any]],
    tenant_id: str,
) -> dict[str, Any]:
    """Match extracted item names to the tenant's catalog.

    - Exact match (case-insensitive) → match_type='exact', confidence=1.0
    - rapidfuzz WRatio ≥ 85 → match_type='fuzzy'
    - Below threshold → unmatched
    """
    catalog_names: list[str] = []
    try:
        catalog_names = await get_item_names(tenant_id)
    except Exception as exc:
        logger.warning("Could not fetch catalog for tenant %s: %s", tenant_id, exc)

    catalog_lower = {name.lower(): name for name in catalog_names}
    matched: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []

    for item in extracted_items:
        name = (item.get("name") or "").strip()
        if not name:
            unmatched.append({**item, "reason": "empty name"})
            continue

        if name.lower() in catalog_lower:
            matched.append({
                **item,
                "catalog_name": catalog_lower[name.lower()],
                "match_type": "exact",
                "match_confidence": 1.0,
            })
            continue

        if catalog_names:
            best_name, score = _fuzzy_best(name, catalog_names)
            if score >= 85:
                matched.append({
                    **item,
                    "catalog_name": best_name,
                    "match_type": "fuzzy",
                    "match_confidence": round(score / 100, 2),
                })
                continue
            unmatched.append({
                **item,
                "reason": f"no catalog match (best: {best_name!r}, score={score})",
            })
        else:
            unmatched.append({**item, "reason": "catalog unavailable"})

    return {"matched": matched, "unmatched": unmatched}


def _fuzzy_best(query: str, choices: list[str]) -> tuple[str, float]:
    """Return the best fuzzy match using rapidfuzz WRatio."""
    try:
        from rapidfuzz import process as rfp, fuzz
        result = rfp.extractOne(query, choices, scorer=fuzz.WRatio)
        if result:
            return result[0], result[1]
    except ImportError:
        # Fallback: difflib
        from difflib import get_close_matches, SequenceMatcher
        matches = get_close_matches(query.lower(), [c.lower() for c in choices], n=1, cutoff=0.6)
        if matches:
            idx = [c.lower() for c in choices].index(matches[0])
            ratio = SequenceMatcher(None, query.lower(), matches[0]).ratio() * 100
            return choices[idx], ratio
    return choices[0] if choices else "", 0.0
