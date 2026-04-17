from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid

from app.core.database import Base


class AiJob(Base):
    __tablename__ = "ai_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    job_type = Column(String(50), nullable=False)          # ocr | voice_query | forecast
    status = Column(String(20), nullable=False, default="pending")
    # pending | processing | completed | failed
    input_data = Column(JSONB, nullable=False, default=dict)
    result_data = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
