"""
Receipt OCR Service via Mindee receipt/v5.

Pipeline:
  1. parse_receipt     — Mindee receipt/v5 extraction
  2. match_vendor      — Finance Service vendor lookup
  3. match_po          — Inventory Service PO lookup by invoice number
  4. flag_discrepancies— Compare receipt vs. PO line-item prices
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Price discrepancy threshold: flag if delta > 5%
PRICE_DISCREPANCY_THRESHOLD = 0.05


async def parse_receipt(image_bytes: bytes) -> dict[str, Any]:
    """Parse a receipt image using Mindee receipt/v5 API.

    Returns structured receipt data:
    {vendor_name, date, total_amount, tax_amount, invoice_number, line_items}
    """
    from mindee import Client, product
    from app.core.config import settings

    client = Client(api_key=settings.mindee_api_key)
    input_source = client.source_from_bytes(image_bytes, "receipt.jpg")
    result = client.parse(product.ReceiptV5, input_source)
    pred = result.document.inference.prediction

    line_items: list[dict[str, Any]] = []
    for item in (pred.line_items or []):
        line_items.append({
            "description": str(item.description) if item.description else None,
            "quantity": float(item.quantity.value) if item.quantity and item.quantity.value else None,
            "unit_price": float(item.unit_price.value) if item.unit_price and item.unit_price.value else None,
            "total_price": float(item.total_amount.value) if item.total_amount and item.total_amount.value else None,
        })

    return {
        "vendor_name": str(pred.supplier_name) if pred.supplier_name else None,
        "date": str(pred.date) if pred.date else None,
        "total_amount": float(pred.total_amount.value) if pred.total_amount and pred.total_amount.value else None,
        "tax_amount": float(pred.total_tax.value) if pred.total_tax and pred.total_tax.value else None,
        "invoice_number": str(pred.document_number) if hasattr(pred, "document_number") and pred.document_number else None,
        "category": str(pred.category) if pred.category else None,
        "line_items": line_items,
    }


async def match_vendor(tenant_id: str, vendor_name: str) -> str | None:
    """Match vendor_name to a Finance Service vendor; return vendor_id or None."""
    if not vendor_name:
        return None
    from app.clients.finance_client import find_vendor
    try:
        vendor = await find_vendor(tenant_id, vendor_name)
        if vendor:
            return str(vendor.get("id", ""))
        return None
    except Exception as exc:
        logger.warning("Vendor lookup failed for %r: %s", vendor_name, exc)
        return None


async def match_po(tenant_id: str, invoice_number: str) -> dict[str, Any] | None:
    """Find a matching Purchase Order by invoice number."""
    if not invoice_number:
        return None
    from app.clients.inventory_client import find_purchase_order
    try:
        return await find_purchase_order(tenant_id, invoice_number)
    except Exception as exc:
        logger.warning("PO lookup failed for invoice %r: %s", invoice_number, exc)
        return None


def flag_price_discrepancies(
    receipt_items: list[dict[str, Any]],
    po_items: list[dict[str, Any]],
    threshold: float = PRICE_DISCREPANCY_THRESHOLD,
) -> list[dict[str, Any]]:
    """Compare receipt line items to PO line items and flag price deltas.

    A discrepancy is flagged when |receipt_price - po_price| / po_price > threshold.

    Returns list of discrepancy objects.
    """
    discrepancies: list[dict[str, Any]] = []

    # Index PO items by description (lowercased)
    po_index: dict[str, dict[str, Any]] = {}
    for item in po_items:
        desc = (item.get("description") or "").lower().strip()
        if desc:
            po_index[desc] = item

    for receipt_item in receipt_items:
        desc = (receipt_item.get("description") or "").lower().strip()
        if not desc:
            continue

        po_item = po_index.get(desc)
        if not po_item:
            continue

        receipt_price = receipt_item.get("unit_price")
        po_price = po_item.get("unit_price")

        if receipt_price is None or po_price is None or po_price == 0:
            continue

        delta = abs(float(receipt_price) - float(po_price))
        delta_pct = delta / float(po_price)

        if delta_pct > threshold:
            discrepancies.append({
                "description": receipt_item.get("description"),
                "receipt_unit_price": float(receipt_price),
                "po_unit_price": float(po_price),
                "delta": round(delta, 4),
                "delta_pct": round(delta_pct * 100, 2),
                "severity": "critical" if delta_pct > 0.15 else "warning",
            })

    return discrepancies
