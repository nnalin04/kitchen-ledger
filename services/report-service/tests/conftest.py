"""
Test configuration — sets required environment variables before service modules are imported.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test_report")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("INTERNAL_SERVICE_SECRET", "test-secret")
os.environ.setdefault("INVENTORY_SERVICE_URL", "http://inventory-service:8082")
os.environ.setdefault("FINANCE_SERVICE_URL", "http://finance-service:8083")
os.environ.setdefault("STAFF_SERVICE_URL", "http://staff-service:8088")
os.environ.setdefault("AUTH_SERVICE_URL", "http://auth-service:8081")
os.environ.setdefault("AI_SERVICE_URL", "http://ai-service:8084")
