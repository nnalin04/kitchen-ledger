"""
Typed async httpx client for Finance Service internal endpoints.
All callers should use these functions rather than calling httpx directly.
"""
import httpx
from app.core.config import settings

_HEADERS = {"x-internal-secret": settings.internal_service_secret}
_BASE = lambda: settings.finance_service_url


async def get_pl_data(tenant_id: str, start: str, end: str) -> dict:
    """
    Fetch computed P&L data from Finance Service.
    Returns PLReportResponse shape (netSales, totalCogs, totalLabor, etc.)
    """
    url = f"{_BASE()}/internal/finance/pl-data"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, params={"tenantId": tenant_id, "start": start, "end": end},
                              headers=_HEADERS)
        r.raise_for_status()
        return r.json().get("data", r.json())


async def get_expenses(tenant_id: str, start: str = "", end: str = "") -> list[dict]:
    url = f"{_BASE()}/internal/finance/expenses"
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


async def get_dsr_list(tenant_id: str, start: str = "", end: str = "") -> list[dict]:
    url = f"{_BASE()}/internal/finance/dsr"
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
