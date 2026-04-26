"""
Natural Language Query Service using GPT-4o function calling.

Two-pass approach:
  1. GPT-4o with tool_choice="auto" selects which finance/inventory tools to call
  2. Tools are executed against real service clients
  3. Second GPT-4o call formats a human-readable answer from tool results
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Any

logger = logging.getLogger(__name__)

from app.core.config import settings  # noqa: E402
from app.clients import finance_client, inventory_client  # noqa: E402

# ── Tool definitions ───────────────────────────────────────────────────────

FINANCE_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_expense_total",
            "description": "Get total expenses for a category and/or vendor in a date range",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "Expense category (e.g. produce, meat, utilities)"},
                    "vendor_name": {"type": "string", "description": "Vendor/supplier name"},
                    "start_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_revenue_summary",
            "description": "Get revenue summary for a date range, optionally with breakdown by category",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                    "breakdown": {"type": "string", "enum": ["daily", "weekly", "category"]},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_food_cost_percent",
            "description": "Get food cost as a percentage of revenue for a date range",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_waste_analysis",
            "description": "Get waste analysis grouped by item or category",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                    "group_by": {"type": "string", "enum": ["item", "category", "station"]},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_item_consumption",
            "description": "Get consumption history for a specific inventory item",
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string", "description": "Name of the inventory item"},
                    "days": {"type": "integer", "description": "Number of days of history", "default": 30},
                },
                "required": ["item_name"],
            },
        },
    },
]


# ── Tool execution ─────────────────────────────────────────────────────────

async def _execute_tool(
    tool_name: str,
    args: dict[str, Any],
    tenant_id: str,
) -> dict[str, Any]:
    """Execute a finance/inventory tool and return the raw result."""
    today = date.today().isoformat()
    week_ago = (date.today() - timedelta(days=7)).isoformat()

    if tool_name == "get_expense_total":
        return await finance_client.get_expense_total(
            tenant_id,
            category=args.get("category"),
            vendor_name=args.get("vendor_name"),
            start_date=args.get("start_date", week_ago),
            end_date=args.get("end_date", today),
        )

    elif tool_name == "get_revenue_summary":
        return await finance_client.get_revenue_summary(
            tenant_id,
            start_date=args.get("start_date", week_ago),
            end_date=args.get("end_date", today),
            breakdown=args.get("breakdown"),
        )

    elif tool_name == "get_food_cost_percent":
        start = args.get("start_date", week_ago)
        end = args.get("end_date", today)
        pl_data = await finance_client.get_pl_data(tenant_id, start, end)
        revenue = pl_data.get("total_revenue", 0) or 1
        food_cost = pl_data.get("food_cost", 0) or 0
        pct = round((food_cost / revenue) * 100, 2)
        return {"food_cost_percent": pct, "food_cost": food_cost, "revenue": revenue}

    elif tool_name == "get_waste_analysis":
        return await inventory_client.get_waste_analysis(
            tenant_id,
            start_date=args.get("start_date", week_ago),
            end_date=args.get("end_date", today),
            group_by=args.get("group_by", "item"),
        )

    elif tool_name == "get_item_consumption":
        item_name = args.get("item_name", "")
        days = int(args.get("days", 30))
        # Fetch item list to find item_id
        items = await inventory_client.get_items_by_names(tenant_id, [item_name])
        if not items:
            return {"error": f"Item {item_name!r} not found", "consumption": []}
        item_id = items[0].get("id", "")
        movements = await inventory_client.get_stock_movements(tenant_id, item_id, days)
        return {"item_name": item_name, "item_id": item_id, "movements": movements}

    return {"error": f"Unknown tool: {tool_name}"}


# ── Chart data extraction ──────────────────────────────────────────────────

def _extract_chart_data(tool_results: dict[str, Any]) -> dict[str, Any] | None:
    """Detect time-series data in tool results and return chart spec."""
    for key, value in tool_results.items():
        if not isinstance(value, dict):
            continue
        # Look for time-series patterns: list of dicts with date + numeric value
        for field_name, field_value in value.items():
            if isinstance(field_value, list) and len(field_value) > 1:
                first = field_value[0] if field_value else {}
                if isinstance(first, dict):
                    has_date = any(k in first for k in ("date", "day", "week", "period"))
                    has_value = any(isinstance(v, (int, float)) for v in first.values())
                    if has_date and has_value:
                        return {"type": "line", "values": field_value}
    return None


# ── Main query processor ───────────────────────────────────────────────────

async def process_query(
    tenant_id: str,
    question: str,
    currency: str = "INR",
) -> dict[str, Any]:
    """Process a natural language financial question.

    Returns:
        {answer: str, data: dict, chart_data: dict | None, suggested_actions: list[str]}
    """
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)

    system_prompt = (
        f"You are a restaurant financial assistant for KitchenLedger. "
        f"Currency: {currency}. Today: {date.today().isoformat()}. "
        "Use the available tools to answer financial questions accurately. "
        "When dates are not specified, assume the last 7 days."
    )

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question},
    ]

    # First pass: tool selection
    response = client.chat.completions.create(
        model="gpt-4o",
        tools=FINANCE_TOOLS,
        tool_choice="auto",
        messages=messages,
    )

    tool_results: dict[str, Any] = {}
    tool_calls = response.choices[0].message.tool_calls or []

    # Execute selected tools
    for tc in tool_calls:
        try:
            args = json.loads(tc.function.arguments or "{}")
        except json.JSONDecodeError as exc:
            logger.warning("nl_query: JSON decode failed for tool args (%s), skipping tool %s", exc, tc.function.name)
            args = {}
        result = await _execute_tool(tc.function.name, args, tenant_id)
        tool_results[tc.function.name] = result

    # Second pass: format human-readable answer
    if tool_results:
        messages.append(response.choices[0].message.model_dump(exclude_unset=True))
        for tc in tool_calls:
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(tool_results.get(tc.function.name, {})),
            })

        answer_response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
        )
        answer = answer_response.choices[0].message.content or "I could not generate an answer."
    else:
        # No tools needed — GPT answered directly
        answer = response.choices[0].message.content or "I could not generate an answer."

    chart_data = _extract_chart_data(tool_results)

    # Generate suggested actions
    suggested_actions = _generate_suggested_actions(tool_results)

    return {
        "answer": answer,
        "data": tool_results,
        "chart_data": chart_data,
        "suggested_actions": suggested_actions,
    }


def _generate_suggested_actions(tool_results: dict[str, Any]) -> list[str]:
    """Generate contextual suggested actions based on tool results."""
    actions: list[str] = []

    if "get_expense_total" in tool_results:
        data = tool_results["get_expense_total"]
        total = data.get("total", 0)
        if isinstance(total, (int, float)) and total > 50000:
            actions.append("Review high-expense categories and renegotiate vendor contracts")

    if "get_waste_analysis" in tool_results:
        actions.append("Set up waste reduction alerts for top wasted items")

    if "get_food_cost_percent" in tool_results:
        pct = tool_results["get_food_cost_percent"].get("food_cost_percent", 0)
        if isinstance(pct, (int, float)) and pct > 35:
            actions.append("Food cost is above 35% — review portion sizes and menu pricing")

    return actions
