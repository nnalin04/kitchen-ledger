"""
Typed async httpx client for Inventory Service internal endpoints.
"""
import httpx
from app.core.config import settings

_HEADERS = {"x-internal-secret": settings.internal_service_secret}
_BASE = lambda: settings.inventory_service_url


async def get_items(tenant_id: str) -> list[dict]:
    url = f"{_BASE()}/internal/inventory/items"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, params={"tenantId": tenant_id}, headers=_HEADERS)
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])


async def get_waste(tenant_id: str, start: str = "", end: str = "") -> list[dict]:
    url = f"{_BASE()}/internal/inventory/waste"
    params: dict = {"tenantId": tenant_id}
    if start:
        params["from"] = start
    if end:
        params["to"] = end
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, params=params, headers=_HEADERS)
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])


async def get_recipes(tenant_id: str) -> list[dict]:
    url = f"{_BASE()}/internal/inventory/recipes"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, params={"tenantId": tenant_id}, headers=_HEADERS)
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])


async def get_counts(tenant_id: str) -> list[dict]:
    url = f"{_BASE()}/internal/inventory/counts"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, params={"tenantId": tenant_id}, headers=_HEADERS)
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])
