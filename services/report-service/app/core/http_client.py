"""
Shared httpx client factory for internal service calls.
All requests include the x-internal-secret header.
"""
from __future__ import annotations
from contextlib import asynccontextmanager
from typing import Any

import httpx

from app.core.config import settings

_TIMEOUT = httpx.Timeout(30.0)


def _headers() -> dict[str, str]:
    return {"x-internal-secret": settings.internal_service_secret}


async def get_json(url: str, params: dict[str, Any] | None = None) -> Any:
    """Make an authenticated GET request and return parsed JSON."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, params=params, headers=_headers())
        resp.raise_for_status()
        return resp.json()
