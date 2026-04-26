"""
Waste Report PDF generator.

Fetches waste log data from Inventory Service and produces a styled A4 PDF
with a summary table, top-5 waste items, and breakdowns by reason and station.
"""
from __future__ import annotations

import io
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
)

_HEADER_BG = colors.HexColor("#1e40af")
_ALT_ROW = colors.HexColor("#f8fafc")
_TWO = Decimal("0.01")


def _table_style(n_data_rows: int) -> TableStyle:
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for i in range(1, n_data_rows + 1):
        if i % 2 == 0:
            cmds.append(("BACKGROUND", (0, i), (-1, i), _ALT_ROW))
    return TableStyle(cmds)


class WasteReportGenerator:
    """
    Generate a waste report PDF.

    Usage:
        gen = WasteReportGenerator()
        pdf_bytes = gen.generate(tenant_id, {
            "start_date": "2024-01-01",
            "end_date":   "2024-01-31",
            "waste_data": [...],   # optional pre-fetched data
        })
    """

    def generate(self, tenant_id: str, parameters: dict) -> bytes:
        waste_data: list[dict] = parameters.get("waste_data") or []
        start = parameters.get("start_date", "")
        end = parameters.get("end_date", "")
        return _render(waste_data, tenant_id, start, end)


def _render(waste_data: list[dict], tenant_id: str, start: str, end: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()
    story: list = []

    story.append(Paragraph("<b>Waste Report</b>", styles["Title"]))
    story.append(Paragraph(f"Period: {start} to {end}", styles["Normal"]))
    story.append(Spacer(1, 6 * mm))

    # Aggregate
    total_cost = Decimal("0")
    by_reason: dict[str, Decimal] = defaultdict(Decimal)
    by_station: dict[str, Decimal] = defaultdict(Decimal)
    item_costs: dict[str, Decimal] = defaultdict(Decimal)

    for entry in waste_data:
        cost = Decimal(str(entry.get("estimatedCost") or entry.get("estimated_cost") or 0)).quantize(
            _TWO, rounding=ROUND_HALF_UP
        )
        total_cost += cost
        reason = str(entry.get("reason") or entry.get("category") or "other")
        station = str(entry.get("station") or entry.get("stationName") or "unknown")
        item = str(
            entry.get("itemName") or entry.get("item_name") or entry.get("inventoryItemId") or "Unknown Item"
        )
        by_reason[reason] += cost
        by_station[station] += cost
        item_costs[item] += cost

    # Summary paragraph
    story.append(Paragraph(f"<b>Total Waste Cost: ₹{total_cost:,.2f}</b>", styles["Heading2"]))
    story.append(Spacer(1, 4 * mm))

    # Reason breakdown table
    story.append(Paragraph("Breakdown by Reason", styles["Heading3"]))
    reason_rows = [["Reason", "Total Cost (₹)"]] + [
        [r, f"{c:,.2f}"] for r, c in sorted(by_reason.items(), key=lambda x: x[1], reverse=True)
    ]
    reason_table = Table(reason_rows, colWidths=[110 * mm, 50 * mm])
    reason_table.setStyle(_table_style(len(reason_rows) - 1))
    story.append(reason_table)
    story.append(Spacer(1, 4 * mm))

    # Station breakdown table
    if by_station:
        story.append(Paragraph("Breakdown by Station", styles["Heading3"]))
        station_rows = [["Station", "Total Cost (₹)"]] + [
            [s, f"{c:,.2f}"] for s, c in sorted(by_station.items(), key=lambda x: x[1], reverse=True)
        ]
        station_table = Table(station_rows, colWidths=[110 * mm, 50 * mm])
        station_table.setStyle(_table_style(len(station_rows) - 1))
        story.append(station_table)
        story.append(Spacer(1, 4 * mm))

    # Top-5 items table
    top5 = sorted(item_costs.items(), key=lambda x: x[1], reverse=True)[:5]
    if top5:
        story.append(Paragraph("Top 5 Waste Items", styles["Heading3"]))
        top5_rows = [["Item", "Total Cost (₹)"]] + [[name, f"{cost:,.2f}"] for name, cost in top5]
        top5_table = Table(top5_rows, colWidths=[110 * mm, 50 * mm])
        top5_table.setStyle(_table_style(len(top5_rows) - 1))
        story.append(top5_table)

    doc.build(story)
    return buf.getvalue()
