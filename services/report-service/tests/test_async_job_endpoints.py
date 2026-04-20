import os
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

# Required for settings import
os.environ.setdefault("DATABASE_URL", "postgresql://kl_user:kl_password@localhost:5432/kitchenledger_test")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("FINANCE_SERVICE_URL", "http://localhost:8083")
os.environ.setdefault("INVENTORY_SERVICE_URL", "http://localhost:8082")
os.environ.setdefault("STAFF_SERVICE_URL", "http://localhost:8088")
os.environ.setdefault("INTERNAL_SERVICE_SECRET", "test-secret")

from app.main import app
from app.core.database import get_db


class _FakeResult:
    def __init__(self, row=None, rows=None):
        self._row = row
        self._rows = rows or []

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows


class _FakeDb:
    def __init__(self, tenant_id: str = "tenant-1"):
        now = datetime.now(timezone.utc)
        self.inserted_job_id = "job-123"
        self.tenant_id = tenant_id
        self.job = SimpleNamespace(
            id=self.inserted_job_id,
            status="pending",
            report_type="pnl",
            created_at=now,
            completed_at=None,
            output_url=None,
            error_message=None,
        )
        self.exec_calls = 0

    async def execute(self, _sql, params=None):
        self.exec_calls += 1

        # submit_report_job → SELECT * WHERE id=:id (after insert)
        if self.exec_calls == 2:
            self.job.id = params["id"]
            return _FakeResult(row=self.job)

        # get_report_job query path
        if params and "tenant_id" in params:
            if params["tenant_id"] == self.tenant_id:
                return _FakeResult(row=self.job)
            return _FakeResult(row=None)

        # list_report_jobs query
        if params and "limit" in params:
            return _FakeResult(rows=[self.job])

        # insert / default
        return _FakeResult()

    async def commit(self):
        return None


def _make_client(fake_db):
    app.dependency_overrides[get_db] = lambda: fake_db
    return TestClient(app)


def _clear_overrides():
    app.dependency_overrides.clear()


def test_submit_pnl_job_returns_202_with_job_id(monkeypatch):
    fake_db = _FakeDb()

    class _GenerateReport:
        @staticmethod
        def delay(*_args, **_kwargs):
            return None

    from app.workers import tasks as worker_tasks
    monkeypatch.setattr(worker_tasks, "generate_report", _GenerateReport)

    client = _make_client(fake_db)
    response = client.post(
        "/api/v1/reports/jobs",
        headers={"x-tenant-id": "tenant-1", "x-user-id": "user-1"},
        json={"report_type": "PNL", "parameters": {"from": "2026-04-01", "to": "2026-04-30"}},
    )

    _clear_overrides()

    assert response.status_code == 202
    body = response.json()
    assert body["job_id"]
    assert body["status"] == "pending"


def test_poll_pending_job_returns_pending_status():
    fake_db = _FakeDb(tenant_id="tenant-1")
    client = _make_client(fake_db)

    response = client.get("/api/v1/reports/jobs/job-123", headers={"x-tenant-id": "tenant-1"})

    _clear_overrides()

    assert response.status_code == 200
    assert response.json()["status"] == "pending"


def test_poll_completed_job_returns_result_url():
    fake_db = _FakeDb(tenant_id="tenant-1")
    fake_db.job.status = "completed"
    fake_db.job.output_url = "https://cdn.example.com/report.pdf"
    fake_db.job.completed_at = datetime.now(timezone.utc)

    client = _make_client(fake_db)
    response = client.get("/api/v1/reports/jobs/job-123", headers={"x-tenant-id": "tenant-1"})

    _clear_overrides()

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert response.json()["result_url"] == "https://cdn.example.com/report.pdf"


def test_poll_wrong_tenant_returns_404():
    fake_db = _FakeDb(tenant_id="tenant-1")
    client = _make_client(fake_db)

    response = client.get("/api/v1/reports/jobs/job-123", headers={"x-tenant-id": "tenant-2"})

    _clear_overrides()

    assert response.status_code == 404
