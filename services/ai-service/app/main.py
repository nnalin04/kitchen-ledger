from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import logging

from app.core.config import settings
from app.routers import ocr, voice, jobs

logger = logging.getLogger(__name__)

app = FastAPI(
    title="KitchenLedger AI Service",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)


# ── Exception hierarchy ────────────────────────────────────────────────────

class ServiceException(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status


class NotFoundException(ServiceException):
    def __init__(self, message: str):
        super().__init__("NOT_FOUND", message, 404)


class AccessDeniedException(ServiceException):
    def __init__(self, message: str):
        super().__init__("FORBIDDEN", message, 403)


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
    from app.core.config import settings
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

app.include_router(ocr.router, prefix="/api/v1/ai", tags=["ocr"])
app.include_router(voice.router, prefix="/api/v1/ai", tags=["voice"])
app.include_router(jobs.router, prefix="/api/v1/ai", tags=["jobs"])
