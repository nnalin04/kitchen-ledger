"""
Receipt OCR Service — Google Cloud Vision + Gemini Flash.

Replaces Mindee with a zero-cost stack that handles Indian GST invoices
better than Mindee (which is trained on Western receipts).

Pipeline:
  1. parse_receipt     — Vision text extraction → Gemini Flash structured parse
                         (falls back to regex parser if Gemini not configured)
  2. match_vendor      — Finance Service vendor lookup
  3. match_po          — Inventory Service PO lookup by invoice number
  4. flag_discrepancies— Compare receipt vs. PO line-item prices
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.core.config import settings
from app.services.ocr_service import preprocess_image, extract_text

logger = logging.getLogger(__name__)

PRICE_DISCREPANCY_THRESHOLD = 0.05

# Gemini 2.5 Flash — free tier: 10 RPM / 500 RPD, supports vision + JSON output
# Docs: https://ai.google.dev/gemini-api/docs/models
GEMINI_MODEL   = "gemini-2.5-flash"
GEMINI_URL     = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

RECEIPT_PROMPT = """You are a restaurant accounting assistant specialising in Indian GST invoices and supplier bills.

Extract structured data from this receipt/invoice text. Support:
- Indian GST invoices (GSTIN, HSN codes, CGST/SGST/IGST)
- Handwritten supplier bills (sabzi mandi, meat market, dairy)
- Printed invoices with rupee (₹ / Rs.) amounts

Return ONLY valid JSON matching this schema exactly:
{
  "vendor_name": string | null,
  "vendor_gstin": string | null,
  "invoice_number": string | null,
  "date": "YYYY-MM-DD" | null,
  "total_amount": number | null,
  "subtotal": number | null,
  "tax_amount": number | null,
  "cgst": number | null,
  "sgst": number | null,
  "igst": number | null,
  "category": string | null,
  "line_items": [
    {
      "description": string,
      "quantity": number | null,
      "unit": string | null,
      "unit_price": number | null,
      "total_price": number | null,
      "hsn_code": string | null
    }
  ]
}

Receipt text:
"""

# ── Regex fallback parser ──────────────────────────────────────────────────────
# Used when GEMINI_API_KEY is not set.

_AMOUNT_RE = re.compile(r"(?:rs\.?|₹|total|amount|grand total)[:\s]*(\d[\d,]*\.?\d*)", re.IGNORECASE)
_TAX_RE    = re.compile(r"(?:tax|gst|cgst|sgst|igst)[:\s]*(\d[\d,]*\.?\d*)", re.IGNORECASE)
_INV_RE    = re.compile(r"(?:invoice\s*(?:no|number|#)|bill\s*no)[:\s]*([A-Z0-9/\-]+)", re.IGNORECASE)
_DATE_RE   = re.compile(
    r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})"
)
_VENDOR_RE = re.compile(r"^(.+?)(?:\s+gstin|\s+ph:|\s+mob:|\s+tel:|$)", re.IGNORECASE | re.MULTILINE)
_ITEM_RE   = re.compile(
    r"^(.+?)\s+(\d+(?:\.\d+)?)\s*(kg|g|gm|l|lt|pcs|nos|pkt|dozen)?\s+(?:@\s*)?(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$",
    re.IGNORECASE | re.MULTILINE,
)


def _parse_with_regex(raw_text: str) -> dict[str, Any]:
    """Best-effort regex parse for receipts/bills."""
    amount_m  = _AMOUNT_RE.search(raw_text)
    tax_m     = _TAX_RE.search(raw_text)
    inv_m     = _INV_RE.search(raw_text)
    vendor_m  = _VENDOR_RE.search(raw_text)

    # Date
    date_str = None
    date_m = _DATE_RE.search(raw_text)
    if date_m:
        d, mo, y = date_m.group(1), date_m.group(2), date_m.group(3)
        if len(y) == 2:
            y = "20" + y
        try:
            date_str = f"{y}-{int(mo):02d}-{int(d):02d}"
        except ValueError:
            pass

    # Line items
    line_items = []
    for m in _ITEM_RE.finditer(raw_text):
        line_items.append({
            "description": m.group(1).strip().title(),
            "quantity": float(m.group(2)),
            "unit": (m.group(3) or "pcs").lower(),
            "unit_price": float(m.group(4)),
            "total_price": float(m.group(5)),
            "hsn_code": None,
        })

    return {
        "vendor_name":   vendor_m.group(1).strip() if vendor_m else None,
        "vendor_gstin":  None,
        "invoice_number": inv_m.group(1).strip() if inv_m else None,
        "date":          date_str,
        "total_amount":  float(amount_m.group(1).replace(",", "")) if amount_m else None,
        "subtotal":      None,
        "tax_amount":    float(tax_m.group(1).replace(",", "")) if tax_m else None,
        "cgst":          None,
        "sgst":          None,
        "igst":          None,
        "category":      None,
        "line_items":    line_items,
    }


# ── Main parse function ────────────────────────────────────────────────────────

async def parse_receipt(image_bytes: bytes) -> dict[str, Any]:
    """Extract and structure a receipt/invoice using Vision + Gemini Flash.

    Falls back to regex parser if GEMINI_API_KEY is not configured.
    Both Vision and Gemini are needed for full accuracy; Vision alone is used
    for text extraction and the regex handles simple printed bills.
    """
    # Step 1: Google Cloud Vision extracts text
    processed = preprocess_image(image_bytes)
    raw_text  = extract_text(processed)

    if not raw_text.strip():
        logger.warning("Vision returned empty text for receipt")
        return _empty_receipt()

    # Step 2: Structured parse
    if settings.gemini_api_key:
        try:
            return await _parse_with_gemini(raw_text)
        except Exception as exc:
            logger.warning("Gemini receipt parse failed (%s), using regex fallback", exc)

    return _parse_with_regex(raw_text)


async def _parse_with_gemini(raw_text: str) -> dict[str, Any]:
    """Use Gemini 1.5 Flash to extract structured receipt data."""
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{GEMINI_URL}?key={settings.gemini_api_key}",
            json={
                "contents": [{"parts": [{"text": RECEIPT_PROMPT + raw_text}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.1,
                },
            },
        )
        response.raise_for_status()

    body = response.json()
    content = body["candidates"][0]["content"]["parts"][0]["text"]
    parsed: dict[str, Any] = json.loads(content)

    # Normalise — ensure all expected keys are present
    for key in ("vendor_name", "vendor_gstin", "invoice_number", "date",
                "total_amount", "subtotal", "tax_amount", "cgst", "sgst",
                "igst", "category", "line_items"):
        parsed.setdefault(key, None)

    if not isinstance(parsed.get("line_items"), list):
        parsed["line_items"] = []

    return parsed


def _empty_receipt() -> dict[str, Any]:
    return {
        "vendor_name": None, "vendor_gstin": None, "invoice_number": None,
        "date": None, "total_amount": None, "subtotal": None, "tax_amount": None,
        "cgst": None, "sgst": None, "igst": None, "category": None, "line_items": [],
    }


# ── Vendor + PO matching ───────────────────────────────────────────────────────

async def match_vendor(tenant_id: str, vendor_name: str) -> str | None:
    if not vendor_name:
        return None
    from app.clients.finance_client import find_vendor
    try:
        vendor = await find_vendor(tenant_id, vendor_name)
        return str(vendor.get("id", "")) if vendor else None
    except Exception as exc:
        logger.warning("Vendor lookup failed for %r: %s", vendor_name, exc)
        return None


async def match_po(tenant_id: str, invoice_number: str) -> dict[str, Any] | None:
    if not invoice_number:
        return None
    from app.clients.inventory_client import find_purchase_order
    try:
        return await find_purchase_order(tenant_id, invoice_number)
    except Exception as exc:
        logger.warning("PO lookup failed for invoice %r: %s", invoice_number, exc)
        return None


# ── Price discrepancy detection ────────────────────────────────────────────────

def flag_price_discrepancies(
    receipt_items: list[dict[str, Any]],
    po_items: list[dict[str, Any]],
    threshold: float = PRICE_DISCREPANCY_THRESHOLD,
) -> list[dict[str, Any]]:
    """Flag line items where |receipt_price - po_price| / po_price > threshold."""
    po_index: dict[str, dict[str, Any]] = {
        (item.get("description") or "").lower().strip(): item
        for item in po_items
    }

    discrepancies = []
    for receipt_item in receipt_items:
        desc = (receipt_item.get("description") or "").lower().strip()
        po_item = po_index.get(desc)
        if not po_item:
            continue

        receipt_price = receipt_item.get("unit_price")
        po_price = po_item.get("unit_price")
        if receipt_price is None or not po_price:
            continue

        delta = abs(float(receipt_price) - float(po_price))
        delta_pct = delta / float(po_price)

        if delta_pct > threshold:
            discrepancies.append({
                "description":       receipt_item.get("description"),
                "receipt_unit_price": float(receipt_price),
                "po_unit_price":      float(po_price),
                "delta":              round(delta, 4),
                "delta_pct":          round(delta_pct * 100, 2),
                "severity":          "critical" if delta_pct > 0.15 else "warning",
            })

    return discrepancies
