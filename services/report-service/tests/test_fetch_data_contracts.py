"""
TDD contract tests for CRIT-04: report-service internal data fetch contracts.

These tests verify that _fetch_data() in tasks.py correctly processes the
response shape returned by the internal inventory/finance/staff endpoints,
and that missing/empty upstream data is handled gracefully (not silently empty).
"""
import pytest
from decimal import Decimal
from unittest.mock import patch, MagicMock


def _safe_list_get_empty(url: str, query: dict | None = None) -> list:
    return []


def _safe_list_get_counts(url: str, query: dict | None = None) -> list:
    return [
        {
            "item_id": "item-1",
            "item_name": "Onion",
            "expected_quantity": 10.0,
            "counted_quantity": 8.0,
            "variance_quantity": -2.0,
            "unit": "kg",
            "unit_cost": 50.0,
        }
    ]


def _safe_list_get_recipes(url: str, query: dict | None = None) -> list:
    return [
        {
            "id": "recipe-1",
            "name": "Tomato Soup",
            "total_cost": 60.0,
            "menuPrice": 150.0,
            "food_cost_percent": 40.0,
            "category": "main",
        }
    ]


class TestInventoryVarianceContract:
    def test_inventory_variance_uses_counted_quantity_for_actual(self):
        """Report computes variance correctly from expected vs counted quantities."""
        from app.workers.tasks import _fetch_data

        with patch("app.workers.tasks._safe_list_get", side_effect=_safe_list_get_counts):
            rows = _fetch_data("inventory-variance", {"from": "2026-04-01", "to": "2026-04-20"}, "tenant-1")

        assert len(rows) == 1
        row = rows[0]
        assert row["item_name"] == "Onion"
        assert float(row["expected_qty"]) == 10.0
        assert float(row["actual_qty"]) == 8.0
        assert float(row["variance_qty"]) == pytest.approx(-2.0)

    def test_inventory_variance_empty_upstream_returns_empty(self):
        """Empty upstream → empty report rows (not an error)."""
        from app.workers.tasks import _fetch_data

        with patch("app.workers.tasks._safe_list_get", side_effect=_safe_list_get_empty):
            rows = _fetch_data("inventory-variance", {}, "tenant-1")

        assert rows == []

    def test_inventory_variance_calculates_variance_pct_correctly(self):
        """Variance % = (actual - expected) / expected * 100."""
        from app.workers.tasks import _fetch_data

        with patch("app.workers.tasks._safe_list_get", side_effect=_safe_list_get_counts):
            rows = _fetch_data("inventory-variance", {}, "tenant-1")

        assert len(rows) == 1
        # (8 - 10) / 10 * 100 = -20%
        assert float(rows[0]["variance_pct"]) == pytest.approx(-20.0)

    def test_inventory_variance_zero_expected_does_not_raise(self):
        """When expected_quantity is 0, variance_pct should be 0 (not ZeroDivisionError)."""
        from app.workers.tasks import _fetch_data

        zero_counts = [
            {
                "item_name": "Salt",
                "expected_quantity": 0,
                "counted_quantity": 5.0,
            }
        ]

        with patch("app.workers.tasks._safe_list_get", return_value=zero_counts):
            rows = _fetch_data("inventory-variance", {}, "tenant-1")

        assert rows[0]["variance_pct"] == 0.0


class TestPnlAndWasteContracts:
    def test_pnl_passes_through_dsr_rows(self):
        """P&L report passes DSR rows through unchanged."""
        from app.workers.tasks import _fetch_data

        dsr_rows = [{"report_date": "2026-04-20", "net_sales": 50000, "total_expenses": 20000}]

        with patch("app.workers.tasks._safe_list_get", return_value=dsr_rows):
            rows = _fetch_data("pnl", {}, "tenant-1")

        assert rows == dsr_rows

    def test_waste_passes_through_waste_rows(self):
        """Waste report passes inventory waste rows through unchanged."""
        from app.workers.tasks import _fetch_data

        waste_rows = [{"item_name": "Tomato", "quantity_wasted": 2.5, "waste_reason": "expired"}]

        with patch("app.workers.tasks._safe_list_get", return_value=waste_rows):
            rows = _fetch_data("waste", {}, "tenant-1")

        assert rows == waste_rows
