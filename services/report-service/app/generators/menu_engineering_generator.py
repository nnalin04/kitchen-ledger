"""
Menu Engineering PDF generator.

Fetches recipes with food_cost_percent and menu_matrix_category from Inventory
Service and renders:
- A 2×2 matrix legend (Stars / Plowhorses / Puzzles / Dogs)
- A table grouped by quadrant
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

# Quadrant display order and colours
_QUADRANTS = {
    "star": ("Stars", colors.HexColor("#16a34a")),
    "plowhorse": ("Plowhorses", colors.HexColor("#2563eb")),
    "puzzle": ("Puzzles", colors.HexColor("#d97706")),
    "dog": ("Dogs", colors.HexColor("#dc2626")),
}


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


class MenuEngineeringGenerator:
    """
    Generate a menu engineering PDF.

    Usage:
        gen = MenuEngineeringGenerator()
        pdf_bytes = gen.generate(tenant_id, {
            "recipes": [...],   # optional pre-fetched recipe list
        })
    """

    def generate(self, tenant_id: str, parameters: dict) -> bytes:
        recipes: list[dict] = parameters.get("recipes") or []
        return _render(recipes, tenant_id)


def _render(recipes: list[dict], tenant_id: str) -> bytes:
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

    story.append(Paragraph("<b>Menu Engineering Report</b>", styles["Title"]))
    story.append(Spacer(1, 4 * mm))

    # Matrix legend table (2×2)
    legend_data = [
        ["High Profit", "STARS\n(High Profit, High Popularity)", "PUZZLES\n(High Profit, Low Popularity)"],
        ["Low Profit", "PLOWHORSES\n(Low Profit, High Popularity)", "DOGS\n(Low Profit, Low Popularity)"],
        ["", "High Popularity", "Low Popularity"],
    ]
    legend_table = Table(legend_data, colWidths=[30 * mm, 75 * mm, 55 * mm])
    legend_table.setStyle(TableStyle([
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#dcfce7")),
        ("BACKGROUND", (2, 0), (2, 0), colors.HexColor("#fef9c3")),
        ("BACKGROUND", (1, 1), (1, 1), colors.HexColor("#dbeafe")),
        ("BACKGROUND", (2, 1), (2, 1), colors.HexColor("#fee2e2")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(legend_table)
    story.append(Spacer(1, 6 * mm))

    # Group recipes by quadrant
    by_quadrant: dict[str, list[dict]] = defaultdict(list)
    for recipe in recipes:
        quadrant_raw = str(
            recipe.get("menuMatrixCategory")
            or recipe.get("menu_matrix_category")
            or recipe.get("classification")
            or "dog"
        ).lower().strip()
        by_quadrant[quadrant_raw].append(recipe)

    # Render a section per quadrant
    for key, (label, header_color) in _QUADRANTS.items():
        items = by_quadrant.get(key, [])
        story.append(Paragraph(f"<b>{label}</b>", styles["Heading2"]))
        if not items:
            story.append(Paragraph("No items in this category.", styles["Normal"]))
            story.append(Spacer(1, 3 * mm))
            continue

        col_widths = [80 * mm, 40 * mm, 40 * mm]
        header_row = ["Item Name", "Food Cost %", "Menu Price (₹)"]
        rows = [header_row]
        for recipe in items:
            name = str(recipe.get("name") or recipe.get("item_name") or "Unknown")
            fcp = Decimal(
                str(recipe.get("foodCostPercent") or recipe.get("food_cost_percent") or 0)
            ).quantize(_TWO, rounding=ROUND_HALF_UP)
            price = Decimal(
                str(recipe.get("menuPrice") or recipe.get("menu_price") or recipe.get("sellingPrice") or 0)
            ).quantize(_TWO, rounding=ROUND_HALF_UP)
            rows.append([name, f"{fcp}%", f"{price:,.2f}"])

        style_cmds = list(_table_style(len(rows) - 1).getCommands())
        style_cmds[0] = ("BACKGROUND", (0, 0), (-1, 0), header_color)
        table = Table(rows, colWidths=col_widths)
        table.setStyle(TableStyle(style_cmds))
        story.append(table)
        story.append(Spacer(1, 4 * mm))

    doc.build(story)
    return buf.getvalue()
