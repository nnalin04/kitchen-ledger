"""
HTTP client for internal calls to the Inventory Service.
All requests include X-Internal-Secret for authentication.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_HEADERS = lambda: {
    "X-Internal-Secret": settings.internal_service_secret,
    "Content-Type": "application/json",
}


async def get_item_names(tenant_id: str) -> list[str]:
    """Fetch all item names for a tenant (used for fuzzy catalog matching)."""
    url = f"{settings.inventory_service_url}/internal/inventory/tenant/{tenant_id}/items"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = client.build_request("GET", url, headers=_HEADERS())
        response = await client.send(resp)
        response.raise_for_status()
        data: list[dict[str, Any]] = response.json()
        return [item.get("name", "") for item in data]


async def get_items_by_names(tenant_id: str, names: list[str]) -> list[dict[str, Any]]:
    """Fetch inventory items matching the given names."""
    params = [("names[]", n) for n in names]
    url = f"{settings.inventory_service_url}/internal/inventory/items"
    headers = {**_HEADERS(), "X-Tenant-Id": tenant_id}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url, params=params, headers=headers)
        response.raise_for_status()
        return response.json()


async def get_item_cost(tenant_id: str, item_id: str) -> dict[str, Any]:
    """Fetch cost data for a single inventory item."""
    url = f"{settings.inventory_service_url}/internal/inventory/items/{item_id}/cost"
    headers = {**_HEADERS(), "X-Tenant-Id": tenant_id}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.json()


async def get_stock_movements(
    tenant_id: str,
    item_id: str,
    days: int = 90,
) -> list[dict[str, Any]]:
    """Fetch stock movement history for an item (for forecasting)."""
    url = f"{settings.inventory_service_url}/internal/inventory/items/{item_id}/movements"
    headers = {**_HEADERS(), "X-Tenant-Id": tenant_id}
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, params={"days": days}, headers=headers)
        response.raise_for_status()
        return response.json()


async def update_stock(
    tenant_id: str,
    user_id: str,
    items: list[dict[str, Any]],
) -> dict[str, Any]:
    """Apply stock count updates from OCR results."""
    url = f"{settings.inventory_service_url}/internal/inventory/stock/bulk-update"
    headers = {**_HEADERS(), "X-Tenant-Id": tenant_id, "X-User-Id": user_id}
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, json={"items": items}, headers=headers)
        response.raise_for_status()
        return response.json()


async def find_purchase_order(
    tenant_id: str,
    invoice_number: str,
) -> dict[str, Any] | None:
    """Look up a PO by invoice number (for receipt OCR matching)."""
    url = f"{settings.inventory_service_url}/internal/inventory/purchase-orders"
    headers = {**_HEADERS(), "X-Tenant-Id": tenant_id}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            url, params={"invoice_number": invoice_number}, headers=headers
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()


async def get_waste_analysis(
    tenant_id: str,
    start_date: str,
    end_date: str,
    group_by: str = "item",
) -> dict[str, Any]:
    """Fetch waste analysis report from Inventory Service."""
    url = f"{settings.inventory_service_url}/internal/inventory/waste/report"
    headers = {**_HEADERS(), "X-Tenant-Id": tenant_id}
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            url,
            params={"start_date": start_date, "end_date": end_date, "group_by": group_by},
            headers=headers,
        )
        response.raise_for_status()
        return response.json()
