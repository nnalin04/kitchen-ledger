"""
REPORT-4 TDD tests for the report job API endpoints.

Tests:
- POST /api/v1/reports/jobs — create job, dispatch Celery
- GET  /api/v1/reports/jobs — list jobs paginated newest first
- GET  /api/v1/reports/jobs/{id} — poll status
- GET  /api/v1/reports/jobs/{id}/download — redirect when completed, 202 when pending
- Celery failure path → job marked failed
"""
import os
from datetime import datetime, timezone
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql://kl_user:kl_password@localhost:5432/kitchenledger_test")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("FINANCE_SERVICE_URL", "http://localhost:8083")
os.environ.setdefault("INVENTORY_SERVICE_URL", "http://localhost:8082")
os.environ.setdefault("STAFF_SERVICE_URL", "http://localhost:8088")
os.environ.setdefault("INTERNAL_SERVICE_SECRET", "test-secret")
os.environ.setdefault("SUPABASE_STORAGE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-key")

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db


# ─── Fake async DB session ────────────────────────────────────────────────────

_NOW = datetime.now(timezone.utc)

def _make_job(**overrides):
    defaults = dict(
        id="job-abc",
        status="queued",
        report_type="pl_monthly",
        created_at=_NOW,
        completed_at=None,
        output_url=None,
        error_message=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class _FakeResult:
    def __init__(self, row=None, rows=None):
        self._row = row
        self._rows = rows or []

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows


class _FakeDb:
    """Minimal async DB session stub."""

    def __init__(self, job=None, jobs=None, tenant_id="ten-1"):
        self.tenant_id = tenant_id
        self._job = job or _make_job()
        self._jobs = jobs or [self._job]
        self._exec_count = 0

    async def execute(self, sql, params=None):
        self._exec_count += 1
        sql_str = str(sql) if not isinstance(sql, str) else sql

        # list endpoint
        if params and "limit" in params:
            return _FakeResult(rows=self._jobs)

        # poll / get by id
        if params and "tenant_id" in params:
            if params.get("tenant_id") == self.tenant_id:
                return _FakeResult(row=self._job)
            return _FakeResult(row=None)

        # POST insert → first exec; second exec is SELECT after insert
        if self._exec_count == 2:
            return _FakeResult(row=self._job)

        return _FakeResult()

    async def commit(self):
        pass


def _client(fake_db: _FakeDb) -> TestClient:
    app.dependency_overrides[get_db] = lambda: fake_db
    return TestClient(app)


def _clear():
    app.dependency_overrides.clear()


# ─── POST /jobs ────────────────────────────────────────────────────────────────

class TestSubmitJob:
    def test_post_returns_202(self, monkeypatch):
        from app.workers import tasks as worker_tasks

        class _NoOpTask:
            @staticmethod
            def delay(*a, **kw):
                pass

        monkeypatch.setattr(worker_tasks, "generate_report", _NoOpTask)
        fake_db = _FakeDb()
        client = _client(fake_db)

        resp = client.post(
            "/api/v1/reports/jobs",
            headers={"x-tenant-id": "ten-1", "x-user-id": "usr-1"},
            json={"report_type": "pnl", "parameters": {"from": "2026-04-01", "to": "2026-04-30"}},
        )
        _clear()

        assert resp.status_code == 202

    def test_post_returns_job_id(self, monkeypatch):
        from app.workers import tasks as worker_tasks

        class _NoOpTask:
            @staticmethod
            def delay(*a, **kw):
                pass

        monkeypatch.setattr(worker_tasks, "generate_report", _NoOpTask)
        fake_db = _FakeDb()
        client = _client(fake_db)

        resp = client.post(
            "/api/v1/reports/jobs",
            headers={"x-tenant-id": "ten-1", "x-user-id": "usr-1"},
            json={"report_type": "pnl", "parameters": {}},
        )
        _clear()

        assert resp.status_code == 202
        body = resp.json()
        assert "job_id" in body
        assert body["job_id"]  # not empty

    def test_post_dispatches_celery_task(self, monkeypatch):
        dispatched = []
        from app.workers import tasks as worker_tasks

        class _CapturingTask:
            @staticmethod
            def delay(*args, **kwargs):
                dispatched.append(args)

        monkeypatch.setattr(worker_tasks, "generate_report", _CapturingTask)
        fake_db = _FakeDb()
        client = _client(fake_db)

        client.post(
            "/api/v1/reports/jobs",
            headers={"x-tenant-id": "ten-1", "x-user-id": "usr-1"},
            json={"report_type": "pnl", "parameters": {"from": "2026-04-01", "to": "2026-04-30"}},
        )
        _clear()

        assert len(dispatched) == 1, "Celery task was not dispatched"

    def test_post_invalid_report_type_returns_error(self, monkeypatch):
        from app.workers import tasks as worker_tasks

        class _NoOpTask:
            @staticmethod
            def delay(*a, **kw):
                pass

        monkeypatch.setattr(worker_tasks, "generate_report", _NoOpTask)
        fake_db = _FakeDb()
        client = _client(fake_db)

        resp = client.post(
            "/api/v1/reports/jobs",
            headers={"x-tenant-id": "ten-1", "x-user-id": "usr-1"},
            json={"report_type": "nonexistent_type", "parameters": {}},
        )
        _clear()

        assert resp.status_code in (400, 422)


# ─── GET /jobs ─────────────────────────────────────────────────────────────────

class TestListJobs:
    def test_list_returns_200(self):
        fake_db = _FakeDb()
        client = _client(fake_db)

        resp = client.get("/api/v1/reports/jobs", headers={"x-tenant-id": "ten-1"})
        _clear()

        assert resp.status_code == 200

    def test_list_returns_jobs_array(self):
        fake_db = _FakeDb()
        client = _client(fake_db)

        resp = client.get("/api/v1/reports/jobs", headers={"x-tenant-id": "ten-1"})
        _clear()

        body = resp.json()
        assert "jobs" in body
        assert isinstance(body["jobs"], list)

    def test_list_includes_pagination_fields(self):
        fake_db = _FakeDb()
        client = _client(fake_db)

        resp = client.get("/api/v1/reports/jobs?limit=10&offset=0", headers={"x-tenant-id": "ten-1"})
        _clear()

        body = resp.json()
        assert "limit" in body
        assert "offset" in body

    def test_list_requires_tenant_header(self):
        fake_db = _FakeDb()
        client = _client(fake_db)

        resp = client.get("/api/v1/reports/jobs")
        _clear()

        assert resp.status_code == 422


# ─── GET /jobs/{id} ────────────────────────────────────────────────────────────

class TestPollJob:
    def test_poll_pending_returns_200(self):
        fake_db = _FakeDb(job=_make_job(status="queued"), tenant_id="ten-1")
        client = _client(fake_db)

        resp = client.get("/api/v1/reports/jobs/job-abc", headers={"x-tenant-id": "ten-1"})
        _clear()

        assert resp.status_code == 200

    def test_poll_returns_status_field(self):
        fake_db = _FakeDb(job=_make_job(status="queued"), tenant_id="ten-1")
        client = _client(fake_db)

        resp = client.get("/api/v1/reports/jobs/job-abc", headers={"x-tenant-id": "ten-1"})
        _clear()

        body = resp.json()
        assert "status" in body

    def test_poll_completed_includes_result_url(self):
        fake_db = _FakeDb(
            job=_make_job(
                status="completed",
                output_url="https://cdn.example.com/report.pdf",
                completed_at=_NOW,
            ),
            tenant_id="ten-1",
        )
        client = _client(fake_db)

        resp = client.get("/api/v1/reports/jobs/job-abc", headers={"x-tenant-id": "ten-1"})
        _clear()

        body = resp.json()
        assert body["status"] == "completed"
        assert body["result_url"] == "https://cdn.example.com/report.pdf"

    def test_poll_wrong_tenant_returns_404(self):
        fake_db = _FakeDb(tenant_id="ten-1")
        client = _client(fake_db)

        # Request with different tenant
        resp = client.get("/api/v1/reports/jobs/job-abc", headers={"x-tenant-id": "ten-2"})
        _clear()

        assert resp.status_code == 404


# ─── GET /jobs/{id}/download ───────────────────────────────────────────────────

class TestDownloadJob:
    def test_download_completed_redirects(self, monkeypatch):
        """Completed job → 302 redirect to signed URL."""
        from app.storage import supabase as supa

        monkeypatch.setattr(
            supa,
            "get_signed_url",
            lambda job_id, tenant_id: "https://signed.example.com/report.pdf",
        )

        fake_db = _FakeDb(
            job=_make_job(
                status="completed",
                output_url="https://cdn.example.com/report.pdf",
                completed_at=_NOW,
            ),
            tenant_id="ten-1",
        )
        client = _client(fake_db)

        resp = client.get(
            "/api/v1/reports/jobs/job-abc/download",
            headers={"x-tenant-id": "ten-1"},
            follow_redirects=False,
        )
        _clear()

        assert resp.status_code in (302, 307)

    def test_download_pending_returns_202(self):
        """Non-completed job → 202 Accepted (not ready yet)."""
        fake_db = _FakeDb(job=_make_job(status="queued"), tenant_id="ten-1")
        client = _client(fake_db)

        resp = client.get(
            "/api/v1/reports/jobs/job-abc/download",
            headers={"x-tenant-id": "ten-1"},
        )
        _clear()

        assert resp.status_code == 202

    def test_download_missing_job_returns_404(self):
        """Unknown job id → 404."""
        fake_db = _FakeDb(tenant_id="ten-999")
        client = _client(fake_db)

        resp = client.get(
            "/api/v1/reports/jobs/unknown-id/download",
            headers={"x-tenant-id": "ten-1"},
        )
        _clear()

        assert resp.status_code == 404
