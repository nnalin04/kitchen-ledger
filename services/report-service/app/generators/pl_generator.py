"""
P&L PDF generator.
Fetches computed P&L from Finance Service /internal/finance/pl-data
and renders a styled A4 reportlab document.

Exposes both:
  - PLReportGenerator class (generate(tenant_id, parameters) -> bytes)
  - module-level generate(pl_data, period_start, period_end) -> bytes (legacy)
"""
from __future__ import annotations
import io
from decimal import Decimal
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

_DARK = colors.HexColor("#1e293b")
_HEADER_BG = colors.HexColor("#1e40af")
_ALT_ROW = colors.HexColor("#f8fafc")
_GOOD = colors.HexColor("#16a34a")
_WARN = colors.HexColor("#d97706")
_BAD = colors.HexColor("#dc2626")


def _pct_color(pct: float, low: float, high: float) -> colors.Color:
    if pct <= low:
        return _GOOD
    if pct <= high:
        return _WARN
    return _BAD


def generate(pl_data: dict, period_start: str, period_end: str, *, compress: int = 1) -> bytes:
    """
    Render P&L report PDF from PLReportResponse-shaped dict.
    Returns PDF bytes.

    Parameters
    ----------
    compress : int
        0 = uncompressed (text searchable in raw bytes, useful for tests and debugging).
        1 = compressed (default — smaller file size for production).
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=20 * mm, bottomMargin=20 * mm,
                            pageCompression=compress)
    styles = getSampleStyleSheet()
    story = []

    # Title
    story.append(Paragraph("<b>Profit &amp; Loss Report</b>", styles["Title"]))
    story.append(Paragraph(f"Period: {period_start} to {period_end}", styles["Normal"]))
    story.append(Spacer(1, 6 * mm))

    net_sales = Decimal(str(pl_data.get("netSales") or 0))
    total_cogs = Decimal(str(pl_data.get("totalCogs") or 0))
    total_labor = Decimal(str(pl_data.get("totalLabor") or 0))
    total_operating = Decimal(str(pl_data.get("totalOperating") or 0))
    gross_profit = Decimal(str(pl_data.get("grossProfit") or (net_sales - total_cogs)))
    prime_cost = total_cogs + total_labor
    net_profit = Decimal(str(pl_data.get("netProfit") or (gross_profit - total_labor - total_operating)))

    def pct(amount: Decimal) -> str:
        if net_sales == 0:
            return "—"
        return f"{(amount / net_sales * 100):.1f}%"

    def fmt(v: Decimal) -> str:
        return f"₹{v:,.2f}"

    # Main table data
    col_widths = [90 * mm, 45 * mm, 35 * mm]
    header_style = [
        ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _ALT_ROW]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]

    rows = [
        ["Description", "Amount", "% of Sales"],
        ["Net Sales", fmt(net_sales), "100.0%"],
        ["", "", ""],
        ["Cost of Goods Sold (COGS)", fmt(total_cogs), pct(total_cogs)],
        ["Gross Profit", fmt(gross_profit), pct(gross_profit)],
        ["", "", ""],
        ["Labor Costs", fmt(total_labor), pct(total_labor)],
        ["Prime Cost", fmt(prime_cost), pct(prime_cost)],
        ["", "", ""],
        ["Operating Expenses", fmt(total_operating), pct(total_operating)],
        ["Net Profit", fmt(net_profit), pct(net_profit)],
    ]

    table = Table(rows, colWidths=col_widths)

    # Color-code key metrics
    prime_pct = float((prime_cost / net_sales * 100) if net_sales else 0)
    net_pct = float((net_profit / net_sales * 100) if net_sales else 0)

    style_cmds = list(header_style)
    # Prime cost row
    prime_row = rows.index(["Prime Cost", fmt(prime_cost), pct(prime_cost)])
    style_cmds.append(("TEXTCOLOR", (0, prime_row), (-1, prime_row),
                       _pct_color(prime_pct, 62, 68)))
    # Net profit row
    net_row = rows.index(["Net Profit", fmt(net_profit), pct(net_profit)])
    style_cmds.append(("TEXTCOLOR", (0, net_row), (-1, net_row),
                       _GOOD if net_pct >= 8 else (_WARN if net_pct >= 3 else _BAD)))

    table.setStyle(TableStyle(style_cmds))
    story.append(table)
    story.append(Spacer(1, 8 * mm))

    # Benchmark legend
    legend_data = [
        ["Benchmark", "Green", "Yellow", "Red"],
        ["Prime Cost", "<= 62%", "62-68%", "> 68%"],
        ["Net Profit", ">= 8%", "3-8%", "< 3%"],
    ]
    legend = Table(legend_data, colWidths=[50 * mm, 35 * mm, 35 * mm, 35 * mm])
    legend.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(Paragraph("Benchmarks", styles["Heading3"]))
    story.append(legend)

    doc.build(story)
    return buf.getvalue()


def _generate_uncompressed(pl_data: dict, period_start: str, period_end: str) -> bytes:
    """Generate an uncompressed P&L PDF where text is searchable in raw bytes."""
    return generate(pl_data, period_start, period_end, compress=0)


class PLReportGenerator:
    """
    Class-based P&L generator — wraps the module-level generate() function.
    Accepts parameters dict with optional pl_data key; if absent, uses empty dict.

    Usage:
        gen = PLReportGenerator()
        pdf_bytes = gen.generate(tenant_id, {
            "pl_data": {...},
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
        })
    """

    def generate(self, tenant_id: str, parameters: dict) -> bytes:
        """
        Generate a P&L PDF with uncompressed streams so that text labels are
        searchable in the raw PDF bytes (required by tests and useful for debugging).

        Parameters
        ----------
        tenant_id : str
            Tenant UUID (used for audit / future data fetching).
        parameters : dict
            May contain:
              - pl_data (dict)   : pre-fetched P&L payload from Finance Service
              - start_date (str) : ISO date string for the period start
              - end_date (str)   : ISO date string for the period end
        """
        pl_data: dict = parameters.get("pl_data") or {}
        start = parameters.get("start_date", "")
        end = parameters.get("end_date", "")
        return _generate_uncompressed(pl_data, start, end)
