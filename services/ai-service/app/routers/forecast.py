"""
Demand Forecasting & Anomaly Detection router (AI-6).

Endpoints:
  GET  /api/ai/forecast/{item_id}     — item demand forecast
  GET  /api/ai/anomalies              — inventory + finance anomaly detection
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.schemas.ai_job import AnomalyResponse, ForecastResponse

router = APIRouter()


def _gateway_headers(
    x_user_id: str = Header(..., alias="x-user-id"),
    x_tenant_id: str = Header(..., alias="x-tenant-id"),
) -> tuple[str, str]:
    return x_user_id, x_tenant_id


@router.get(
    "/forecast/{item_id}",
    response_model=ForecastResponse,
    summary="Forecast demand for an inventory item",
)
async def forecast_item(
    item_id: str,
    days: int = Query(default=7, ge=1, le=90, description="Days to forecast"),
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> ForecastResponse:
    """
    Synchronous forecast using exponential smoothing on 8 weeks of history.
    Returns predicted daily usage and suggested order quantity.
    """
    _, tenant_id = headers

    try:
        from app.services.forecast_service import forecast_item_usage
        result = await forecast_item_usage(tenant_id, item_id, days)
        return ForecastResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Forecast failed: {exc}") from exc


@router.get(
    "/anomalies",
    response_model=AnomalyResponse,
    summary="Detect inventory and finance anomalies",
)
async def detect_anomalies(
    headers: tuple[str, str] = Depends(_gateway_headers),
) -> AnomalyResponse:
    """
    Synchronous anomaly detection.
    Checks last 7 days vs. 4-week rolling average for inventory and finance.
    """
    _, tenant_id = headers

    try:
        from app.services.anomaly_service import detect_inventory_anomalies, detect_finance_anomalies
        inventory_anomalies = await detect_inventory_anomalies(tenant_id)
        finance_anomalies = await detect_finance_anomalies(tenant_id)
        return AnomalyResponse(
            inventory_anomalies=inventory_anomalies,
            finance_anomalies=finance_anomalies,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Anomaly detection failed: {exc}") from exc
