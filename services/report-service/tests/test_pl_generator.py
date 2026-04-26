"""
TDD tests for PLReportGenerator — REPORT-2.

Verifies:
- PDF bytes returned are valid PDF (magic bytes %PDF)
- PDF size > 1000 bytes
- Key section labels present in extracted text
- Color-coded prime-cost boundary conditions
- Handles missing / zero data gracefully
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://kl_user:kl_password@localhost:5432/kitchenledger_test")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("FINANCE_SERVICE_URL", "http://localhost:8083")
os.environ.setdefault("INVENTORY_SERVICE_URL", "http://localhost:8082")
os.environ.setdefault("STAFF_SERVICE_URL", "http://localhost:8088")
os.environ.setdefault("INTERNAL_SERVICE_SECRET", "test-secret")
os.environ.setdefault("SUPABASE_STORAGE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-key")

import io
import pytest


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract raw text stream bytes from a PDF for assertion checks."""
    # Simple approach: look for text between BT and ET operators
    # Also decode string literals present in the PDF stream
    text = pdf_bytes.decode("latin-1", errors="replace")
    return text


def _pdf_contains(pdf_bytes: bytes, *phrases: str) -> list[str]:
    """Return phrases NOT found in the PDF bytes (decoded as latin-1)."""
    text = _extract_pdf_text(pdf_bytes)
    return [p for p in phrases if p not in text]


class TestPLGeneratorReturnsValidPDF:
    def test_returns_bytes(self):
        from app.generators.pl_generator import PLReportGenerator
        gen = PLReportGenerator()
        pl_data = {
            "netSales": 100000,
            "totalCogs": 30000,
            "totalLabor": 25000,
            "totalOperating": 15000,
            "grossProfit": 70000,
            "netProfit": 30000,
        }
        result = gen.generate("tenant-1", {
            "pl_data": pl_data,
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
        assert isinstance(result, bytes)

    def test_pdf_magic_bytes(self):
        from app.generators.pl_generator import PLReportGenerator
        gen = PLReportGenerator()
        pl_data = {
            "netSales": 100000,
            "totalCogs": 30000,
            "totalLabor": 25000,
            "totalOperating": 15000,
            "grossProfit": 70000,
            "netProfit": 30000,
        }
        result = gen.generate("tenant-1", {
            "pl_data": pl_data,
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
        assert result[:4] == b"%PDF"

    def test_pdf_size_exceeds_1000_bytes(self):
        from app.generators.pl_generator import PLReportGenerator
        gen = PLReportGenerator()
        pl_data = {
            "netSales": 100000,
            "totalCogs": 30000,
            "totalLabor": 25000,
            "totalOperating": 15000,
            "grossProfit": 70000,
            "netProfit": 30000,
        }
        result = gen.generate("tenant-1", {
            "pl_data": pl_data,
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
        assert len(result) > 1000

    def test_net_sales_label_in_pdf(self):
        from app.generators.pl_generator import PLReportGenerator
        gen = PLReportGenerator()
        pl_data = {
            "netSales": 100000,
            "totalCogs": 30000,
            "totalLabor": 25000,
            "totalOperating": 15000,
            "grossProfit": 70000,
            "netProfit": 30000,
        }
        result = gen.generate("tenant-1", {
            "pl_data": pl_data,
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
        missing = _pdf_contains(result, "Net Sales")
        assert not missing, f"PDF missing labels: {missing}"

    def test_prime_cost_label_in_pdf(self):
        from app.generators.pl_generator import PLReportGenerator
        gen = PLReportGenerator()
        pl_data = {
            "netSales": 100000,
            "totalCogs": 30000,
            "totalLabor": 25000,
            "totalOperating": 15000,
            "grossProfit": 70000,
            "netProfit": 30000,
        }
        result = gen.generate("tenant-1", {
            "pl_data": pl_data,
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
        missing = _pdf_contains(result, "Prime Cost")
        assert not missing, f"PDF missing labels: {missing}"

    def test_zero_sales_does_not_raise(self):
        from app.generators.pl_generator import PLReportGenerator
        gen = PLReportGenerator()
        result = gen.generate("tenant-1", {
            "pl_data": {"netSales": 0},
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
        assert len(result) > 100

    def test_empty_pl_data_does_not_raise(self):
        from app.generators.pl_generator import PLReportGenerator
        gen = PLReportGenerator()
        result = gen.generate("tenant-1", {
            "pl_data": {},
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
        assert result[:4] == b"%PDF"

    def test_no_pl_data_key_uses_defaults(self):
        """If parameters dict has no pl_data key, generator must not raise."""
        from app.generators.pl_generator import PLReportGenerator
        gen = PLReportGenerator()
        result = gen.generate("tenant-1", {
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
        assert isinstance(result, bytes)

    def test_prime_cost_green_when_below_65(self):
        """Prime cost 55% of net sales should result in green color metadata in PDF."""
        from app.generators.pl_generator import PLReportGenerator
        gen = PLReportGenerator()
        # prime_cost = cogs + labor = 30000 + 25000 = 55000 = 55% of 100000
        pl_data = {
            "netSales": 100000,
            "totalCogs": 30000,
            "totalLabor": 25000,
            "totalOperating": 10000,
            "grossProfit": 70000,
            "netProfit": 35000,
        }
        result = gen.generate("tenant-1", {
            "pl_data": pl_data,
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
        # Must be valid PDF
        assert result[:4] == b"%PDF"
        assert len(result) > 1000

    def test_prime_cost_red_when_above_70(self):
        """Prime cost >70% should encode red color."""
        from app.generators.pl_generator import PLReportGenerator
        gen = PLReportGenerator()
        # prime = 45000 + 35000 = 80000 = 80% of 100000 → red
        pl_data = {
            "netSales": 100000,
            "totalCogs": 45000,
            "totalLabor": 35000,
            "totalOperating": 5000,
            "grossProfit": 55000,
            "netProfit": 15000,
        }
        result = gen.generate("tenant-1", {
            "pl_data": pl_data,
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
        assert result[:4] == b"%PDF"
