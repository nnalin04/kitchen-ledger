# ── Stage 1: Dependencies ─────────────────────────────────────
FROM python:3.12-slim AS base
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 2: Runtime ──────────────────────────────────────────
FROM base AS runtime
WORKDIR /app

RUN addgroup --system klgroup && adduser --system --group kluser

COPY --chown=kluser:klgroup . .

USER kluser

EXPOSE 8087

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8087"]
