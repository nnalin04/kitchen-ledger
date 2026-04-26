"""
Supabase Storage client for report file uploads.
"""
from __future__ import annotations
from supabase import create_client, Client
from app.core.config import settings

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            settings.supabase_storage_url or "http://localhost:54321",
            settings.supabase_service_key or "",
        )
    return _client


def upload_report(job_id: str, tenant_id: str, content: bytes, mime_type: str = "application/pdf") -> str:
    """
    Upload a report file to Supabase Storage.
    Returns a signed URL valid for 24 hours.
    """
    ext = "pdf" if "pdf" in mime_type else "csv"
    path = f"{tenant_id}/{job_id}.{ext}"
    bucket = "reports"
    get_client().storage.from_(bucket).upload(
        path, content, file_options={"content-type": mime_type, "upsert": "true"}
    )
    result = get_client().storage.from_(bucket).create_signed_url(path, expires_in=86400)
    return result.get("signedURL") or result.get("signedUrl", "")


def get_signed_url(job_id: str, tenant_id: str, expires_in: int = 3600) -> str:
    """
    Generate a fresh signed URL for an existing report file.

    Tries both .pdf and .csv extensions — returns the first valid URL.
    Falls back to an empty string if neither exists.
    """
    bucket = "reports"
    for ext in ("pdf", "csv"):
        path = f"{tenant_id}/{job_id}.{ext}"
        try:
            result = get_client().storage.from_(bucket).create_signed_url(path, expires_in=expires_in)
            url = result.get("signedURL") or result.get("signedUrl", "")
            if url:
                return url
        except Exception:
            continue
    return ""
