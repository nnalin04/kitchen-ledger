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


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service"}


# ── Routers ────────────────────────────────────────────────────────────────

app.include_router(ocr.router, prefix="/api/v1/ai", tags=["ocr"])
app.include_router(voice.router, prefix="/api/v1/ai", tags=["voice"])
app.include_router(jobs.router, prefix="/api/v1/ai", tags=["jobs"])
