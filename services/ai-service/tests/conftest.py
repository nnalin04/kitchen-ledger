"""
Test configuration — sets required environment variables and mocks heavy
infrastructure dependencies before any service modules are imported.
Unit tests should not require running databases, Redis, or RabbitMQ.
"""
import os
import sys
from unittest.mock import MagicMock

# ── Env vars ────────────────────────────────────────────────────────────────
# These are fake values; no real network connections are made in unit tests.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test_ai")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("MINDEE_API_KEY", "test-mindee-key")

# ── Mock infrastructure modules ─────────────────────────────────────────────
# Prevent SQLAlchemy from trying to import psycopg2 / connect to PostgreSQL.
mock_db_module = MagicMock()
mock_db_module.SessionLocal = MagicMock
mock_db_module.Base = MagicMock()
sys.modules.setdefault("app.core.database", mock_db_module)

# Prevent Celery from connecting to Redis/RabbitMQ at import time.
mock_celery_module = MagicMock()
sys.modules.setdefault("app.workers.celery_app", mock_celery_module)

# Prevent RabbitMQ publisher from connecting at import time.
mock_rabbitmq_module = MagicMock()
sys.modules.setdefault("app.core.rabbitmq", mock_rabbitmq_module)
