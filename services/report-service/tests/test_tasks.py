"""
Unit tests for report-service Celery tasks.

External dependencies are mocked:
  - psycopg2 (DB status updates)
  - httpx (internal service HTTP calls)
  - pika / publish_event (RabbitMQ)
  - supabase (storage upload)
"""
import os
import uuid
from unittest.mock import MagicMock, patch, call

import pytest

# Set required env vars before importing app modules
os.environ.setdefault("DATABASE_URL", "postgresql://kl_user:kl_password@localhost:5432/kitchenledger_test")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("FINANCE_SERVICE_URL", "http://localhost:8083")
os.environ.setdefault("INVENTORY_SERVICE_URL", "http://localhost:8082")
os.environ.setdefault("STAFF_SERVICE_URL", "http://localhost:8088")
os.environ.setdefault("INTERNAL_SERVICE_SECRET", "test-secret")


# ── helpers ───────────────────────────────────────────────────────────────────

def _mock_db():
    """Return a mock psycopg2 connection + cursor pair."""
    cursor = MagicMock()
    cursor.__enter__ = lambda s: cursor
    cursor.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.__enter__ = lambda s: conn
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value = cursor
    return conn, cursor


# ── generate_report ───────────────────────────────────────────────────────────

class TestGenerateReport:

    @patch("app.workers.tasks.publish_event")
    @patch("app.workers.tasks._get_supabase")
    @patch("app.workers.tasks.httpx")
    @patch("app.workers.tasks.psycopg2")
    def test_marks_processing_then_completed(self, mock_psycopg2, mock_httpx, mock_supabase, mock_publish):
        """Status should go processing → completed on success."""
        conn, cursor = _mock_db()
        mock_psycopg2.connect.return_value = conn

        # Minimal HTTP responses
        mock_httpx.get.return_value = MagicMock(status_code=200, json=MagicMock(return_value=[]))

        # Supabase upload returns a path
        mock_supabase.storage.from_.return_value.upload.return_value = {"path": "reports/test.pdf"}
        mock_supabase.storage.from_.return_value.create_signed_url.return_value = {
            "signedURL": "https://storage/signed/test.pdf"
        }

        job_id   = str(uuid.uuid4())
        tenant_id = str(uuid.uuid4())

        from app.workers.tasks import generate_report
        generate_report(job_id, "pnl", {"from": "2026-01-01", "to": "2026-01-31"}, tenant_id)

        # Should have written "processing" and "completed" statuses
        execute_calls = [str(c) for c in cursor.execute.call_args_list]
        statuses = [c for c in execute_calls if "processing" in c or "completed" in c]
        assert len(statuses) >= 2, f"Expected at least 2 status updates, got: {execute_calls}"

    @patch("app.workers.tasks.publish_event")
    @patch("app.workers.tasks._get_supabase")
    @patch("app.workers.tasks.httpx")
    @patch("app.workers.tasks.psycopg2")
    def test_publishes_report_generated_event(self, mock_psycopg2, mock_httpx, mock_supabase, mock_publish):
        """Must publish report.generated event after successful generation."""
        conn, cursor = _mock_db()
        mock_psycopg2.connect.return_value = conn
        mock_httpx.get.return_value = MagicMock(status_code=200, json=MagicMock(return_value=[]))
        mock_supabase.storage.from_.return_value.upload.return_value = {"path": "reports/test.pdf"}
        mock_supabase.storage.from_.return_value.create_signed_url.return_value = {
            "signedURL": "https://storage/signed/test.pdf"
        }

        job_id   = str(uuid.uuid4())
        tenant_id = str(uuid.uuid4())

        from app.workers.tasks import generate_report
        generate_report(job_id, "pnl", {"from": "2026-01-01", "to": "2026-01-31"}, tenant_id)

        mock_publish.assert_called_once()
        call_args = mock_publish.call_args
        assert call_args[0][0] == "report.generated"
        assert call_args[0][1] == tenant_id
        payload = call_args[0][2]
        assert "report_name" in payload
        assert "url" in payload

    @patch("app.workers.tasks.publish_event")
    @patch("app.workers.tasks._get_supabase")
    @patch("app.workers.tasks.httpx")
    @patch("app.workers.tasks.psycopg2")
    def test_marks_failed_on_http_exception(self, mock_psycopg2, mock_httpx, mock_supabase, mock_publish):
        """If HTTP call to internal service fails, status should be set to 'failed'."""
        conn, cursor = _mock_db()
        mock_psycopg2.connect.return_value = conn
        mock_httpx.get.side_effect = Exception("service unavailable")

        job_id   = str(uuid.uuid4())
        tenant_id = str(uuid.uuid4())

        from app.workers.tasks import generate_report
        # Should not raise — errors are caught and status set to failed
        generate_report(job_id, "pnl", {"from": "2026-01-01", "to": "2026-01-31"}, tenant_id)

        execute_calls = [str(c) for c in cursor.execute.call_args_list]
        assert any("failed" in c for c in execute_calls), \
            f"Expected 'failed' status update, got: {execute_calls}"
        mock_publish.assert_not_called()

    @patch("app.workers.tasks.publish_event")
    @patch("app.workers.tasks._get_supabase")
    @patch("app.workers.tasks.httpx")
    @patch("app.workers.tasks.psycopg2")
    def test_waste_report_type_is_supported(self, mock_psycopg2, mock_httpx, mock_supabase, mock_publish):
        """'waste' report type should complete without error."""
        conn, cursor = _mock_db()
        mock_psycopg2.connect.return_value = conn
        mock_httpx.get.return_value = MagicMock(status_code=200, json=MagicMock(return_value=[]))
        mock_supabase.storage.from_.return_value.upload.return_value = {"path": "reports/waste.pdf"}
        mock_supabase.storage.from_.return_value.create_signed_url.return_value = {
            "signedURL": "https://storage/signed/waste.pdf"
        }

        job_id   = str(uuid.uuid4())
        tenant_id = str(uuid.uuid4())

        from app.workers.tasks import generate_report
        generate_report(job_id, "waste", {"from": "2026-01-01", "to": "2026-01-31"}, tenant_id)

        mock_publish.assert_called_once()
