import subprocess
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.exceptions import ServiceException, NotFoundException, AccessDeniedException  # noqa: F401
from app.core.logging_config import configure_logging, get_logger

configure_logging()
logger = get_logger(__name__)

# Import routers AFTER defining exceptions to avoid circular imports.
# Routers import from app.core.exceptions (not from app.main).
from app.routers import ocr, voice, jobs, query, forecast  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            capture_output=True, text=True, check=True
        )
        logger.info("Alembic migrations applied: %s", result.stdout.strip() or "up to date")
    except subprocess.CalledProcessError as e:
        logger.error("Alembic migration failed: %s", e.stderr)
        raise
    yield


app = FastAPI(
    title="KitchenLedger AI Service",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
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
    return {"status": "ok", "service": "ai-service"}


@app.get("/ready")
async def ready():
    """Readiness probe — checks DB and Redis connectivity before serving traffic."""
    from app.core.database import SessionLocal
    import redis as redis_lib

    checks: dict[str, str] = {}

    # DB check
    try:
        db = SessionLocal()
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db.close()
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"

    # Redis check
    try:
        r = redis_lib.from_url(settings.redis_url, socket_connect_timeout=2)
        r.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"

    all_ok = all(v == "ok" for v in checks.values())
    from fastapi import Response
    return Response(
        content=__import__("json").dumps({"ready": all_ok, "checks": checks}),
        status_code=200 if all_ok else 503,
        media_type="application/json",
    )


# ── Routers ────────────────────────────────────────────────────────────────

app.include_router(ocr.router, prefix="/api/ai", tags=["ocr"])
app.include_router(voice.router, prefix="/api/ai", tags=["voice"])
app.include_router(query.router, prefix="/api/ai", tags=["query"])
app.include_router(forecast.router, prefix="/api/ai", tags=["forecast"])
app.include_router(jobs.router, prefix="/api/ai", tags=["jobs"])
