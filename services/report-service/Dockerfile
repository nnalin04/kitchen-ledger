FROM python:3.12-slim
RUN addgroup --system app && adduser --system --group app
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER app
HEALTHCHECK CMD curl -f http://localhost:8087/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8087"]
