"""
Inventory Valuation PDF generator.

Fetches inventory items from Inventory Service and produces a styled A4 PDF:
- Items sorted by ABC category then by (current_stock × avg_cost) descending.
- Table: item name, category, stock, unit, unit cost, total value.
- Summary row with totals per ABC category.
"""
from __future__ import annotations

import io
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

_ABC_ORDER = {"A": 0, "B": 1, "C": 2}


def _table_style(n_data_rows: int) -> TableStyle:
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    for i in range(1, n_data_rows + 1):
        if i % 2 == 0:
            cmds.append(("BACKGROUND", (0, i), (-1, i), _ALT_ROW))
    return TableStyle(cmds)


class InventoryValuationGenerator:
    """
    Generate an inventory valuation PDF.

    Usage:
        gen = InventoryValuationGenerator()
        pdf_bytes = gen.generate(tenant_id, {
            "items": [...],   # optional pre-fetched inventory items
        })
    """

    def generate(self, tenant_id: str, parameters: dict) -> bytes:
        items: list[dict] = parameters.get("items") or []
        return _render(items, tenant_id)


def _render(items: list[dict], tenant_id: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()
    story: list = []

    story.append(Paragraph("<b>Inventory Valuation Report</b>", styles["Title"]))
    story.append(Spacer(1, 6 * mm))

    # Build enriched rows
    enriched: list[dict] = []
    for item in items:
        stock = Decimal(str(item.get("currentStock") or item.get("current_stock") or 0)).quantize(
            _TWO, rounding=ROUND_HALF_UP
        )
        cost = Decimal(str(item.get("avgCost") or item.get("avg_cost") or item.get("unitCost") or 0)).quantize(
            _TWO, rounding=ROUND_HALF_UP
        )
        total = (stock * cost).quantize(_TWO, rounding=ROUND_HALF_UP)
        abc = str(item.get("abcCategory") or item.get("abc_category") or "C").upper()
        enriched.append(
            {
                "name": str(item.get("name") or item.get("itemName") or "Unknown"),
                "category": abc,
                "stock": stock,
                "unit": str(item.get("unit") or ""),
                "unit_cost": cost,
                "total": total,
            }
        )

    # Sort: ABC category first, then total value descending
    enriched.sort(key=lambda x: (_ABC_ORDER.get(x["category"], 3), -x["total"]))

    # Grand total and per-category totals
    grand_total = Decimal("0")
    abc_totals: dict[str, Decimal] = {"A": Decimal("0"), "B": Decimal("0"), "C": Decimal("0")}
    for r in enriched:
        grand_total += r["total"]
        abc_totals[r["category"]] = abc_totals.get(r["category"], Decimal("0")) + r["total"]

    story.append(Paragraph(f"<b>Total Inventory Value: ₹{grand_total:,.2f}</b>", styles["Heading2"]))
    story.append(Spacer(1, 4 * mm))

    # Main table
    col_widths = [55 * mm, 18 * mm, 20 * mm, 15 * mm, 22 * mm, 25 * mm]
    header = ["Item Name", "ABC", "Stock", "Unit", "Unit Cost (₹)", "Total Value (₹)"]
    rows = [header]
    for r in enriched:
        rows.append([
            r["name"],
            r["category"],
            f"{r['stock']:,.2f}",
            r["unit"],
            f"{r['unit_cost']:,.2f}",
            f"{r['total']:,.2f}",
        ])

    # Totals row
    rows.append([
        "TOTAL",
        "",
        "",
        "",
        "",
        f"{grand_total:,.2f}",
    ])

    table = Table(rows, colWidths=col_widths)
    style_cmds = list(_table_style(len(rows) - 2).getCommands())
    # Bold last row (totals)
    style_cmds.append(("FONTNAME", (0, len(rows) - 1), (-1, len(rows) - 1), "Helvetica-Bold"))
    style_cmds.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), colors.HexColor("#e2e8f0")))
    table.setStyle(TableStyle(style_cmds))
    story.append(table)
    story.append(Spacer(1, 6 * mm))

    # ABC summary
    story.append(Paragraph("ABC Category Summary", styles["Heading3"]))
    abc_rows = [["Category", "Total Value (₹)"]]
    for cat in ("A", "B", "C"):
        abc_rows.append([f"Category {cat}", f"{abc_totals.get(cat, Decimal('0')):,.2f}"])
    abc_table = Table(abc_rows, colWidths=[80 * mm, 50 * mm])
    abc_table.setStyle(_table_style(3))
    story.append(abc_table)

    doc.build(story)
    return buf.getvalue()
