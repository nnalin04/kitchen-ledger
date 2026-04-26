"""
Test configuration — sets required environment variables and mocks heavy
infrastructure dependencies before any service modules are imported.
Unit tests should not require running databases, Redis, or RabbitMQ.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock
from sqlalchemy.orm import declarative_base

# ── Shared mock DB session (used by the get_db override) ────────────────────
_mock_session = MagicMock()


def _mock_get_db():
    """Proper generator so FastAPI's dependency inspector sees zero parameters."""
    yield _mock_session


# ── Real declarative base so AiJob model is properly SQLAlchemy-instrumented ─
_MockBase = declarative_base()


# ── Env vars ────────────────────────────────────────────────────────────────
# These are fake values; no real network connections are made in unit tests.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test_ai")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("MINDEE_API_KEY", "test-mindee-key")
os.environ.setdefault("INTERNAL_SERVICE_SECRET", "test-secret")
os.environ.setdefault("GOOGLE_CLOUD_CREDENTIALS", "")
os.environ.setdefault("INVENTORY_SERVICE_URL", "http://localhost:8082")
os.environ.setdefault("FINANCE_SERVICE_URL", "http://localhost:8083")
os.environ.setdefault("FILE_SERVICE_URL", "http://localhost:8085")

# ── Mock infrastructure modules ─────────────────────────────────────────────
# Prevent SQLAlchemy from trying to import psycopg2 / connect to PostgreSQL.
mock_db_module = MagicMock()
mock_db_module.SessionLocal = MagicMock
mock_db_module.Base = _MockBase  # real declarative base so AiJob gets proper SQLAlchemy instrumentation
mock_db_module.get_db = _mock_get_db  # real generator so FastAPI sees zero params
sys.modules.setdefault("app.core.database", mock_db_module)

# Prevent Celery from connecting to Redis/RabbitMQ at import time.
# The task decorator must be a no-op so the real function body is preserved
# and tests can call cleanup_stuck_jobs() / process_ocr() directly.
mock_celery_module = MagicMock()
mock_celery_module.celery_app = MagicMock()
mock_celery_module.celery_app.task = lambda *a, **kw: (lambda fn: fn)
sys.modules.setdefault("app.workers.celery_app", mock_celery_module)

# Prevent RabbitMQ publisher from connecting at import time.
mock_rabbitmq_module = MagicMock()
sys.modules.setdefault("app.core.rabbitmq", mock_rabbitmq_module)

# Prevent Celery task workers from executing real I/O at import time.
mock_ocr_tasks = MagicMock()
sys.modules.setdefault("app.workers.ocr_tasks", mock_ocr_tasks)
mock_voice_tasks = MagicMock()
sys.modules.setdefault("app.workers.voice_tasks", mock_voice_tasks)
mock_forecast_tasks = MagicMock()
sys.modules.setdefault("app.workers.forecast_tasks", mock_forecast_tasks)


# ── Pytest fixtures ──────────────────────────────────────────────────────────

import uuid as _uuid_mod


def _refresh_with_uuid(obj):
    """Give newly-created SQLAlchemy objects a UUID if they don't have one yet."""
    try:
        if obj.id is None:
            obj.id = _uuid_mod.uuid4()
    except Exception:
        pass


@pytest.fixture
def mock_db():
    """Yields the shared mock DB session used by the API test client.

    FastAPI's get_db dependency is wired to _mock_get_db which yields _mock_session.
    Configure _mock_session in tests that use the TestClient instead of patching get_db.
    The refresh side-effect assigns a UUID to new objects so Pydantic validation passes.
    """
    _mock_session.reset_mock()
    _mock_session.refresh.side_effect = _refresh_with_uuid
    return _mock_session
