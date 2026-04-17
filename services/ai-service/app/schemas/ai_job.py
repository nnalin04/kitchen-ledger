from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, HttpUrl


class OcrRequest(BaseModel):
    file_upload_id: str
    file_url: str
    document_type: str = "receipt"  # receipt | invoice | delivery_note


class VoiceQueryRequest(BaseModel):
    query: str
    context: Optional[str] = None  # e.g. "inventory" | "finance" | "staff"


class JobResponse(BaseModel):
    id: UUID
    job_type: str
    status: str
    input_data: dict[str, Any]
    result_data: Optional[dict[str, Any]]
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OcrSubmitResponse(BaseModel):
    job_id: UUID
    status: str


class VoiceQueryResponse(BaseModel):
    query: str
    interpreted: dict[str, Any]
    suggestion: str
