"""
GST Summary CSV generator.

Aggregates tax_collected from DSRs by week/month and outputs CSV bytes.
Columns: date, gross_sales, tax_rate, tax_collected
"""
from __future__ import annotations

import io
import csv
from decimal import Decimal, ROUND_HALF_UP

_TWO = Decimal("0.01")


class GSTSummaryGenerator:
    """
    Generate a GST summary CSV.

    Usage:
        gen = GSTSummaryGenerator()
        csv_bytes = gen.generate(tenant_id, {
            "start_date": "2024-01-01",
            "end_date":   "2024-01-31",
            "dsr_list":   [...],   # optional pre-fetched DSR list
        })
    """

    def generate(self, tenant_id: str, parameters: dict) -> bytes:
        dsr_list: list[dict] = parameters.get("dsr_list") or []
        start = parameters.get("start_date", "")
        end = parameters.get("end_date", "")
        return _render(dsr_list, tenant_id, start, end)


def _render(dsr_list: list[dict], tenant_id: str, start: str, end: str) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "gross_sales", "tax_rate", "tax_collected"])

    for dsr in dsr_list:
        report_date = str(
            dsr.get("reportDate") or dsr.get("report_date") or ""
        )[:10]  # ISO date portion only
        gross_sales = Decimal(
            str(dsr.get("grossSales") or dsr.get("gross_sales") or 0)
        ).quantize(_TWO, rounding=ROUND_HALF_UP)
        tax_collected = Decimal(
            str(dsr.get("taxCollected") or dsr.get("tax_collected") or 0)
        ).quantize(_TWO, rounding=ROUND_HALF_UP)
        # Derive effective tax rate from data; default to 0 if gross_sales is zero
        tax_rate = (
            ((tax_collected / gross_sales) * 100).quantize(_TWO, rounding=ROUND_HALF_UP)
            if gross_sales > 0
            else Decimal("0.00")
        )
        writer.writerow([report_date, str(gross_sales), str(tax_rate), str(tax_collected)])

    return buf.getvalue().encode("utf-8")
