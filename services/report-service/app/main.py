import subprocess
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
import logging
from app.core.logging_config import configure_logging

configure_logging()
from app.core.exceptions import (  # noqa: E402 — must be before router import
    ServiceException,
    NotFoundException,
    AccessDeniedException,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run DB migrations, start background consumers on startup; clean up on shutdown."""
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            capture_output=True, text=True, check=True
        )
        logger.info("Alembic migrations applied: %s", result.stdout.strip() or "up to date")
    except subprocess.CalledProcessError as e:
        logger.error("Alembic migration failed: %s", e.stderr)
        raise
    try:
        from app.consumers.dsr_reconciled import start_consumer_thread
        start_consumer_thread()
        logger.info("lifespan: dsr_reconciled consumer thread started")
    except Exception as exc:
        logger.warning("lifespan: could not start dsr_reconciled consumer: %s", exc)
    yield
    # Shutdown: daemon thread exits automatically with the process


app = FastAPI(
    title="KitchenLedger Report Service",
    version="0.1.0",
    docs_url="/docs" if getattr(settings, 'debug', False) else None,
    redoc_url="/redoc" if getattr(settings, 'debug', False) else None,
    lifespan=lifespan,
)


# ── Exception handlers ─────────────────────────────────────────────────────

@app.exception_handler(ServiceException)
async def service_exception_handler(request: Request, exc: ServiceException):
    return JSONResponse(
        status_code=exc.status,
        content={"success": False, "error": {"code": exc.code, "message": exc.message}},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"},
        },
    )


# ── Health / Readiness ─────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "report-service"}


@app.get("/ready")
async def ready():
    """Readiness probe — checks DB connectivity before serving traffic."""
    checks: dict[str, str] = {}

    try:
        import psycopg2
        from app.core.config import settings
        conn = psycopg2.connect(settings.database_url, connect_timeout=3)
        conn.close()
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"

    all_ok = all(v == "ok" for v in checks.values())
    from fastapi import Response
    return Response(
        content=__import__("json").dumps({"ready": all_ok, "checks": checks}),
        status_code=200 if all_ok else 503,
        media_type="application/json",
    )


# ── Routers ────────────────────────────────────────────────────────────────

from app.routers.reports import router as reports_router  # noqa: E402

app.include_router(reports_router, prefix="/api/v1/reports", tags=["reports"])
