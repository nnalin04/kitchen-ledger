"""
HTTP client for internal calls to the Finance Service.
All requests include X-Internal-Secret for authentication.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def _headers(tenant_id: Optional[str] = None) -> dict[str, str]:
    h = {
        "X-Internal-Secret": settings.internal_service_secret,
        "Content-Type": "application/json",
    }
    if tenant_id:
        h["X-Tenant-Id"] = tenant_id
    return h


async def get_pl_data(
    tenant_id: str,
    start_date: str,
    end_date: str,
) -> dict[str, Any]:
    """Fetch profit & loss data for the given date range."""
    url = f"{settings.finance_service_url}/internal/finance/pl-data"
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            url,
            params={"start_date": start_date, "end_date": end_date},
            headers=_headers(tenant_id),
        )
        response.raise_for_status()
        return response.json()


async def get_expense_total(
    tenant_id: str,
    category: Optional[str] = None,
    vendor_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict[str, Any]:
    """Fetch expense summary, optionally filtered by category/vendor/date."""
    url = f"{settings.finance_service_url}/internal/finance/expenses/summary"
    params: dict[str, Any] = {}
    if category:
        params["category"] = category
    if vendor_name:
        params["vendor_name"] = vendor_name
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, params=params, headers=_headers(tenant_id))
        response.raise_for_status()
        return response.json()


async def get_revenue_summary(
    tenant_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    breakdown: Optional[str] = None,
) -> dict[str, Any]:
    """Fetch revenue summary, optionally with category breakdown."""
    url = f"{settings.finance_service_url}/internal/finance/revenue"
    params: dict[str, Any] = {}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    if breakdown:
        params["breakdown"] = breakdown

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, params=params, headers=_headers(tenant_id))
        response.raise_for_status()
        return response.json()


async def get_waste_analysis(
    tenant_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    group_by: str = "item",
) -> dict[str, Any]:
    """Fetch waste analysis report via Inventory Service (proxied through Finance)."""
    # Waste analysis lives in Inventory Service — use inventory_client for the actual call.
    # This wrapper is provided for the finance client interface defined in the epic.
    from app.clients.inventory_client import get_waste_analysis as inv_waste
    return await inv_waste(
        tenant_id=tenant_id,
        start_date=start_date or "",
        end_date=end_date or "",
        group_by=group_by,
    )


async def find_vendor(
    tenant_id: str,
    vendor_name: str,
) -> dict[str, Any] | None:
    """Look up a vendor by name in Finance Service."""
    url = f"{settings.finance_service_url}/internal/finance/vendors"
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            url,
            params={"name": vendor_name},
            headers=_headers(tenant_id),
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        data = response.json()
        # API returns list; return first match
        if isinstance(data, list):
            return data[0] if data else None
        return data


async def create_expense(
    tenant_id: str,
    user_id: str,
    expense: dict[str, Any],
) -> dict[str, Any]:
    """Create a new expense entry in Finance Service."""
    url = f"{settings.finance_service_url}/internal/finance/expenses"
    headers = {**_headers(tenant_id), "X-User-Id": user_id}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(url, json=expense, headers=headers)
        response.raise_for_status()
        return response.json()
