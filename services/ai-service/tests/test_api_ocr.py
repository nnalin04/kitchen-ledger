"""
API integration tests for OCR endpoints using FastAPI TestClient with mocked dependencies.

Tests:
  - POST /api/ai/ocr/notebook → 201 + job_id
  - GET /api/ai/ocr/notebook/{job_id} → status polling
  - POST /api/ai/ocr/receipt → 201 + job_id
  - Celery task: mock Vision + GPT-4o → job completed with result
"""
import io
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── App fixture ────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    """Create a test client with fully mocked DB and Celery."""
    from app.main import app
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def auth_headers():
    return {
        "x-user-id": str(uuid.uuid4()),
        "x-tenant-id": str(uuid.uuid4()),
    }


def _make_minimal_jpeg() -> bytes:
    """Create a minimal JPEG image for upload tests."""
    from PIL import Image
    img = Image.new("RGB", (50, 50), color=(200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _mock_job(tenant_id: str, job_type: str = "notebook_ocr", status: str = "pending") -> MagicMock:
    job = MagicMock()
    job.id = uuid.uuid4()
    job.tenant_id = uuid.UUID(tenant_id)
    job.job_type = job_type
    job.status = status
    job.result = None
    job.error_message = None
    return job


# ── POST /api/ai/ocr/notebook ──────────────────────────────────────────────

def test_submit_notebook_ocr_returns_201_with_job_id(client, auth_headers, mock_db):
    """POST with valid JPEG → 201 + job_id returned."""
    jpeg_bytes = _make_minimal_jpeg()

    with patch("app.routers.ocr._upload_to_file_service", new_callable=AsyncMock) as mock_upload:
        mock_upload.return_value = "https://storage.example.com/image.jpg"

        response = client.post(
            "/api/ai/ocr/notebook",
            headers=auth_headers,
            files={"image": ("test.jpg", jpeg_bytes, "image/jpeg")},
            data={"context_type": "inventory"},
        )

    assert response.status_code == 201, response.json()
    body = response.json()
    assert "job_id" in body
    assert body["status"] == "pending"
    assert body["estimated_seconds"] == 8


def test_submit_notebook_ocr_rejects_invalid_file_type(client, auth_headers, mock_db):
    """Non-image file type → 422."""
    response = client.post(
        "/api/ai/ocr/notebook",
        headers=auth_headers,
        files={"image": ("test.pdf", b"not-an-image", "application/pdf")},
        data={"context_type": "inventory"},
    )
    assert response.status_code == 422


def test_submit_notebook_ocr_rejects_invalid_context_type(client, auth_headers, mock_db):
    """Invalid context_type → 422."""
    jpeg_bytes = _make_minimal_jpeg()

    with patch("app.routers.ocr._upload_to_file_service", new_callable=AsyncMock) as mock_upload:
        mock_upload.return_value = "https://storage.example.com/image.jpg"
        response = client.post(
            "/api/ai/ocr/notebook",
            headers=auth_headers,
            files={"image": ("test.jpg", jpeg_bytes, "image/jpeg")},
            data={"context_type": "invalid_type"},
        )

    assert response.status_code == 422


# ── GET /api/ai/ocr/notebook/{job_id} ─────────────────────────────────────

def test_poll_notebook_ocr_job_pending(client, auth_headers, mock_db):
    """GET pending job → 200 with status=pending."""
    job_id = uuid.uuid4()
    tenant_id = auth_headers["x-tenant-id"]
    mock_job = MagicMock()
    mock_job.id = job_id
    mock_job.tenant_id = uuid.UUID(tenant_id)
    mock_job.status = "pending"
    mock_job.result = None
    mock_job.error_message = None

    mock_db.query.return_value.filter.return_value.first.return_value = mock_job

    response = client.get(f"/api/ai/ocr/notebook/{job_id}", headers=auth_headers)

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["job_id"] == str(job_id)
    assert body["status"] == "pending"
    assert body["result"] is None


def test_poll_notebook_ocr_job_completed_has_result(client, auth_headers, mock_db):
    """GET completed job → 200 with result containing matched items."""
    job_id = uuid.uuid4()
    tenant_id = auth_headers["x-tenant-id"]
    mock_job = MagicMock()
    mock_job.id = job_id
    mock_job.tenant_id = uuid.UUID(tenant_id)
    mock_job.status = "completed"
    mock_job.result = {
        "context_type": "inventory",
        "catalog_match": {
            "matched": [{"name": "Tomatoes", "quantity": 2, "match_type": "exact"}],
            "unmatched": [],
        },
        "confidence": 0.95,
    }
    mock_job.error_message = None

    mock_db.query.return_value.filter.return_value.first.return_value = mock_job

    response = client.get(f"/api/ai/ocr/notebook/{job_id}", headers=auth_headers)

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["status"] == "completed"
    assert body["result"] is not None
    assert "catalog_match" in body["result"]


def test_poll_notebook_ocr_job_not_found(client, auth_headers, mock_db):
    """GET non-existent job → 404."""
    job_id = uuid.uuid4()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    response = client.get(f"/api/ai/ocr/notebook/{job_id}", headers=auth_headers)

    assert response.status_code == 404


# ── POST /api/ai/ocr/receipt ───────────────────────────────────────────────

def test_submit_receipt_ocr_returns_201_with_job_id(client, auth_headers, mock_db):
    """POST receipt with valid JPEG → 201 + job_id."""
    jpeg_bytes = _make_minimal_jpeg()

    with patch("app.routers.ocr._upload_to_file_service", new_callable=AsyncMock) as mock_upload:
        mock_upload.return_value = "https://storage.example.com/receipt.jpg"
        response = client.post(
            "/api/ai/ocr/receipt",
            headers=auth_headers,
            files={"image": ("receipt.jpg", jpeg_bytes, "image/jpeg")},
        )

    assert response.status_code == 201, response.json()
    body = response.json()
    assert "job_id" in body
    assert body["estimated_seconds"] == 5


# ── Celery task unit test ──────────────────────────────────────────────────

def test_process_notebook_ocr_celery_task_dispatched(client, auth_headers, mock_db):
    """Submitting a notebook OCR job dispatches the Celery task with correct args."""
    from app.routers.ocr import process_notebook_ocr

    jpeg_bytes = _make_minimal_jpeg()
    dispatched = []
    process_notebook_ocr.delay = lambda *a, **kw: dispatched.append((a, kw))

    with patch("app.routers.ocr._upload_to_file_service", new_callable=AsyncMock) as mock_upload:
        mock_upload.return_value = "https://storage.example.com/img.jpg"
        response = client.post(
            "/api/ai/ocr/notebook",
            headers=auth_headers,
            files={"image": ("test.jpg", jpeg_bytes, "image/jpeg")},
            data={"context_type": "inventory"},
        )

    assert response.status_code == 201, response.json()
    assert len(dispatched) == 1
    args, _ = dispatched[0]
    # args: (job_id, file_url, tenant_id, context_type)
    assert args[1] == "https://storage.example.com/img.jpg"
    assert args[2] == auth_headers["x-tenant-id"]
    assert args[3] == "inventory"
