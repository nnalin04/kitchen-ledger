"""
Expense Breakdown PDF generator.

Fetches expense data from Finance Service and produces a styled A4 PDF with:
- Bar-style table: category, total amount, count, % of revenue.
- Sorted by amount descending.
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


class ExpenseBreakdownGenerator:
    """
    Generate an expense breakdown PDF.

    Usage:
        gen = ExpenseBreakdownGenerator()
        pdf_bytes = gen.generate(tenant_id, {
            "start_date":   "2024-01-01",
            "end_date":     "2024-01-31",
            "expenses":     [...],   # optional pre-fetched expenses list
            "revenue":      100000,  # optional total revenue for % calc
        })
    """

    def generate(self, tenant_id: str, parameters: dict) -> bytes:
        expenses: list[dict] = parameters.get("expenses") or []
        revenue = Decimal(str(parameters.get("revenue") or 0)).quantize(_TWO, rounding=ROUND_HALF_UP)
        start = parameters.get("start_date", "")
        end = parameters.get("end_date", "")
        return _render(expenses, revenue, tenant_id, start, end)


def _render(
    expenses: list[dict],
    revenue: Decimal,
    tenant_id: str,
    start: str,
    end: str,
) -> bytes:
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

    story.append(Paragraph("<b>Expense Breakdown Report</b>", styles["Title"]))
    story.append(Paragraph(f"Period: {start} to {end}", styles["Normal"]))
    story.append(Spacer(1, 6 * mm))

    # Aggregate by category
    by_category: dict[str, dict] = defaultdict(lambda: {"total": Decimal("0"), "count": 0})
    grand_total = Decimal("0")
    for exp in expenses:
        category = str(exp.get("category") or exp.get("accountType") or "other").strip()
        amount = Decimal(str(exp.get("amount") or 0)).quantize(_TWO, rounding=ROUND_HALF_UP)
        by_category[category]["total"] += amount
        by_category[category]["count"] += 1
        grand_total += amount

    story.append(Paragraph(f"<b>Total Expenses: ₹{grand_total:,.2f}</b>", styles["Heading2"]))
    story.append(Spacer(1, 4 * mm))

    # Build table rows sorted by amount desc
    header = ["Category", "Total Amount (₹)", "Count", "% of Revenue"]
    rows = [header]
    for cat, data in sorted(by_category.items(), key=lambda x: x[1]["total"], reverse=True):
        pct = (
            ((data["total"] / revenue) * 100).quantize(_TWO, rounding=ROUND_HALF_UP)
            if revenue > 0
            else Decimal("0.00")
        )
        rows.append([cat, f"{data['total']:,.2f}", str(data["count"]), f"{pct}%"])

    # Totals row
    total_pct = (
        ((grand_total / revenue) * 100).quantize(_TWO, rounding=ROUND_HALF_UP)
        if revenue > 0
        else Decimal("0.00")
    )
    rows.append(["TOTAL", f"{grand_total:,.2f}", "", f"{total_pct}%"])

    col_widths = [70 * mm, 45 * mm, 20 * mm, 30 * mm]
    table = Table(rows, colWidths=col_widths)
    style_cmds = list(_table_style(len(rows) - 2).getCommands())
    style_cmds.append(("FONTNAME", (0, len(rows) - 1), (-1, len(rows) - 1), "Helvetica-Bold"))
    style_cmds.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), colors.HexColor("#e2e8f0")))
    table.setStyle(TableStyle(style_cmds))
    story.append(table)

    doc.build(story)
    return buf.getvalue()
