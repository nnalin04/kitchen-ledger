"""
OCR Service — handwritten notebook scanning pipeline.

Pipeline:
  1. preprocess_image   — PIL enhance for OCR accuracy
  2. extract_text       — Google Cloud Vision document_text_detection
  3. parse_with_gpt4o   — GPT-4o multimodal JSON extraction
  4. match_to_catalog   — exact + GPT-4o-mini fuzzy match against item catalog
"""
from __future__ import annotations

import base64
import io
import json
import logging
from typing import Any, Literal

logger = logging.getLogger(__name__)

# Import at module level so tests can patch via app.services.ocr_service.*
from app.core.config import settings  # noqa: E402
from app.clients.inventory_client import get_item_names  # noqa: E402


# ── Image preprocessing ────────────────────────────────────────────────────

def preprocess_image(image_bytes: bytes) -> bytes:
    """Convert image to grayscale, enhance contrast + sharpness for OCR.

    Returns JPEG bytes at quality=95.
    """
    from PIL import Image, ImageEnhance, ImageFilter

    if not image_bytes:
        raise ValueError("image_bytes cannot be empty")

    img = Image.open(io.BytesIO(image_bytes)).convert("L")  # grayscale

    img = ImageEnhance.Contrast(img).enhance(2.0)
    img = ImageEnhance.Sharpness(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


# ── Google Cloud Vision OCR ────────────────────────────────────────────────

def extract_text(image_bytes: bytes) -> str:
    """Run Google Cloud Vision document_text_detection.

    Raises RuntimeError if Vision API returns an error.
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


# ── GPT-4o multimodal parsing ──────────────────────────────────────────────

def parse_with_gpt4o(
    raw_text: str,
    image_bytes: bytes,
    context_type: Literal["inventory", "expense"],
    known_items: list[str],
) -> dict[str, Any]:
    """Parse raw OCR text + original image with GPT-4o multimodal.

    Uses response_format=json_object and temperature=0.1 for consistency.
    """
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)

    item_list_str = ", ".join(known_items[:50]) if known_items else "none"

    if context_type == "inventory":
        system_prompt = (
            "You are a restaurant inventory assistant. Extract items from the handwritten notebook image. "
            f"Known catalog items: {item_list_str}. "
            "Return JSON with keys: "
            "items (array of {name, quantity, unit, date, cost_per_unit, notes}), "
            "confidence (0.0-1.0), "
            "unreadable_sections (array of strings describing illegible areas)."
        )
    else:
        system_prompt = (
            "You are a restaurant accounting assistant. Extract expense entries from the handwritten notebook image. "
            "Return JSON with keys: "
            "expenses (array of {description, amount, payee, date}), "
            "confidence (0.0-1.0), "
            "unreadable_sections (array of strings)."
        )

    # Encode image as base64 data URL
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    image_url = f"data:image/jpeg;base64,{b64}"

    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        temperature=0.1,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"Raw OCR text:\n{raw_text}\n\nPlease extract and structure the data from this image.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url, "detail": "high"},
                    },
                ],
            },
        ],
    )

    raw = response.choices[0].message.content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("parse_with_gpt4o: JSON decode failed (%s), returning empty result", exc)
        return {"items": [], "expenses": [], "confidence": 0.0, "unreadable_sections": []}


# ── Catalog matching ───────────────────────────────────────────────────────

async def match_to_catalog(
    extracted_items: list[dict[str, Any]],
    tenant_id: str,
) -> dict[str, Any]:
    """Match extracted item names against the tenant's catalog.

    - Exact match (case-insensitive) → match_type='exact', match_confidence=1.0
    - No exact match → fuzzy match via GPT-4o-mini
      - confidence > 0.85 → matched list
      - confidence ≤ 0.85 → unmatched list

    Returns:
        {
            matched: [{...original item..., catalog_name, catalog_id, match_type, match_confidence}],
            unmatched: [{...original item..., reason}],
        }
    """
    catalog_names: list[str] = []
    try:
        catalog_names = await get_item_names(tenant_id)
    except Exception as exc:
        logger.warning("Could not fetch catalog for tenant %s: %s", tenant_id, exc)

    catalog_lower = {name.lower(): name for name in catalog_names}

    matched: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []
    needs_fuzzy: list[dict[str, Any]] = []

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
        else:
            needs_fuzzy.append(item)

    if needs_fuzzy and catalog_names:
        fuzzy_results = await _fuzzy_match_batch(needs_fuzzy, catalog_names)
        for item, fuzzy in zip(needs_fuzzy, fuzzy_results):
            if fuzzy["confidence"] > 0.85:
                matched.append({
                    **item,
                    "catalog_name": fuzzy["match"],
                    "match_type": "fuzzy",
                    "match_confidence": fuzzy["confidence"],
                })
            else:
                unmatched.append({
                    **item,
                    "reason": f"no catalog match (best: {fuzzy['match']!r}, confidence={fuzzy['confidence']:.2f})",
                })
    else:
        for item in needs_fuzzy:
            unmatched.append({**item, "reason": "no catalog available or no match found"})

    return {"matched": matched, "unmatched": unmatched}


async def _fuzzy_match_batch(
    items: list[dict[str, Any]],
    catalog_names: list[str],
) -> list[dict[str, Any]]:
    """Use GPT-4o-mini to fuzzy-match item names to catalog names.

    Returns one result per item: {match: str, confidence: float}
    """
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)

    item_names = [item.get("name", "") for item in items]
    catalog_str = json.dumps(catalog_names[:200])  # cap to avoid token overflow

    prompt = (
        "Match each extracted item name to the closest catalog item. "
        "Return JSON: {matches: [{extracted, match, confidence}]} "
        "where confidence is 0.0-1.0 (1.0=perfect, 0.0=no match). "
        "If no reasonable match exists, use confidence=0.0 and match=null.\n\n"
        f"Catalog: {catalog_str}\n\n"
        f"Items to match: {json.dumps(item_names)}"
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        temperature=0,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("_fuzzy_match_batch: JSON decode failed (%s), treating all as unmatched", exc)
        data = {}
    results = data.get("matches", [])

    # Normalize output
    out: list[dict[str, Any]] = []
    for i, item in enumerate(items):
        if i < len(results):
            r = results[i]
            out.append({
                "match": r.get("match") or "",
                "confidence": float(r.get("confidence", 0.0)),
            })
        else:
            out.append({"match": "", "confidence": 0.0})
    return out
