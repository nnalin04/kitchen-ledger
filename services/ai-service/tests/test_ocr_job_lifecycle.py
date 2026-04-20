"""
Unit tests for AiJob state machine helpers and the cleanup_stuck_jobs task.
Tests the actual _mark_* helpers and the cleanup SQL in tasks.py.
"""
import pytest
import uuid
from unittest.mock import MagicMock, patch, call


# ── State machine helpers ──────────────────────────────────────────────────


def _make_job(status="pending"):
    job = MagicMock()
    job.id = uuid.uuid4()
    job.status = status
    job.result_data = None
    job.error_message = None
    return job


def test_job_created_with_pending_status():
    """AiJob starts with status='pending' and no result data."""
    from app.workers.tasks import _get_job

    job = _make_job(status="pending")
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = job

    result = _get_job(mock_db, str(job.id))

    assert result.status == "pending"
    assert result.result_data is None
    assert result.error_message is None


def test_job_transitions_to_processing_when_celery_picks_up():
    """_mark_processing sets status to 'processing' and commits."""
    from app.workers.tasks import _mark_processing

    job = _make_job(status="pending")
    mock_db = MagicMock()

    _mark_processing(mock_db, job)

    assert job.status == "processing"
    mock_db.commit.assert_called_once()


def test_job_transitions_to_completed_with_structured_data():
    """_mark_completed sets status='completed' and stores result_data."""
    from app.workers.tasks import _mark_completed

    job = _make_job(status="processing")
    mock_db = MagicMock()
    result = {
        "provider": "mindee",
        "document_type": "invoice",
        "vendor_name": "FreshFarms Co",
        "total_amount": 8500.00,
        "line_items": [
            {"description": "Lettuce", "quantity": 20.0, "unit_price": 45.0, "total_amount": 900.0}
        ],
    }

    _mark_completed(mock_db, job, result)

    assert job.status == "completed"
    assert job.result_data["vendor_name"] == "FreshFarms Co"
    assert job.result_data["total_amount"] == 8500.00
    assert len(job.result_data["line_items"]) == 1
    mock_db.commit.assert_called_once()


def test_job_transitions_to_failed_on_provider_error():
    """_mark_failed sets status='failed' and stores the error message."""
    from app.workers.tasks import _mark_failed

    job = _make_job(status="processing")
    mock_db = MagicMock()
    error_msg = "Mindee API rate limit exceeded"

    _mark_failed(mock_db, job, error_msg)

    assert job.status == "failed"
    assert job.error_message == error_msg
    assert job.result_data is None   # unchanged
    mock_db.commit.assert_called_once()


def test_stuck_job_cleanup_marks_as_failed():
    """
    cleanup_stuck_jobs executes a SQL UPDATE that marks stale 'processing' jobs
    as failed. Verifies the task runs without error and commits the transaction.
    """
    from app.workers.tasks import cleanup_stuck_jobs

    mock_db = MagicMock()

    with patch("app.workers.tasks.SessionLocal", return_value=mock_db):
        cleanup_stuck_jobs()

    # Verify execute was called (contains the UPDATE statement)
    mock_db.execute.assert_called_once()
    sql_call_args = mock_db.execute.call_args[0][0]
    assert "failed" in str(sql_call_args).lower()
    assert "processing" in str(sql_call_args).lower()
    mock_db.commit.assert_called_once()
    mock_db.close.assert_called_once()
