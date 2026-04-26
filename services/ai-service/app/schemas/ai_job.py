from __future__ import annotations
from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID
from pydantic import BaseModel, Field


# ── Legacy schemas kept for backward compat ────────────────────────────────

class OcrRequest(BaseModel):
    file_upload_id: str
    file_url: str
    document_type: str = "receipt"  # receipt | invoice | delivery_note


class VoiceQueryRequest(BaseModel):
    query: str
    context: Optional[str] = None


class JobResponse(BaseModel):
    id: UUID
    job_type: str
    status: str
    input_data: Optional[dict[str, Any]]
    result: Optional[dict[str, Any]]
    error_message: Optional[str]
    model_used: Optional[str]
    tokens_used: Optional[int]
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class OcrSubmitResponse(BaseModel):
    job_id: UUID
    status: str
    estimated_seconds: int = 8


class VoiceQueryResponse(BaseModel):
    query: str
    interpreted: dict[str, Any]
    suggestion: str


# ── AI-2: Notebook OCR ─────────────────────────────────────────────────────

class NotebookOcrSubmitRequest(BaseModel):
    context_type: Literal["inventory", "expense"] = "inventory"
    target_date: Optional[str] = None  # ISO date string


class NotebookOcrSubmitResponse(BaseModel):
    job_id: UUID
    status: str
    estimated_seconds: int = 8


class NotebookOcrJobResponse(BaseModel):
    job_id: UUID
    status: str
    result: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None


class CommitItems(BaseModel):
    items_to_update: list[dict[str, Any]] = Field(default_factory=list)
    expenses_to_create: list[dict[str, Any]] = Field(default_factory=list)
    items_to_create: list[dict[str, Any]] = Field(default_factory=list)


class CommitResponse(BaseModel):
    committed: bool
    updated_items: int
    created_expenses: int
    created_items: int


# ── AI-3: Receipt OCR ──────────────────────────────────────────────────────

class ReceiptOcrSubmitRequest(BaseModel):
    context_type: Literal["receipt"] = "receipt"


class ReceiptOcrSubmitResponse(BaseModel):
    job_id: UUID
    status: str
    estimated_seconds: int = 5


# ── AI-4: Voice Transcription ──────────────────────────────────────────────

class VoiceTranscribeResponse(BaseModel):
    transcript: str
    parsed: dict[str, Any]
    confidence: float


# ── AI-5: Natural Language Query ───────────────────────────────────────────

class NlQueryRequest(BaseModel):
    question: str


class NlQueryResponse(BaseModel):
    answer: str
    data: dict[str, Any]
    chart_data: Optional[dict[str, Any]] = None
    suggested_actions: list[str] = Field(default_factory=list)


# ── AI-6: Forecasting ──────────────────────────────────────────────────────

class ForecastPoint(BaseModel):
    date: str
    predicted_usage: float


class ForecastResponse(BaseModel):
    item_id: str
    item_name: str
    current_stock: float
    forecast: list[ForecastPoint]
    suggested_order_quantity: float


class AnomalyItem(BaseModel):
    item_id: Optional[str] = None
    item_name: Optional[str] = None
    category: Optional[str] = None
    current_value: float
    rolling_average: float
    deviation_pct: float
    severity: Literal["warning", "critical"]


class AnomalyResponse(BaseModel):
    inventory_anomalies: list[AnomalyItem]
    finance_anomalies: list[AnomalyItem]
