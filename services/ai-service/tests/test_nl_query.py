"""
Unit tests for app/services/nl_query_service.py

Tests:
  - Tool selection: correct tool called for expense/revenue/waste questions
  - Tool execution: _execute_tool maps to correct client calls
  - Chart data extraction: time-series detected correctly
  - process_query: end-to-end with mocked OpenAI + clients
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Helpers ────────────────────────────────────────────────────────────────

def _make_tool_call(name: str, args: dict, call_id: str = "call_1") -> MagicMock:
    tc = MagicMock()
    tc.id = call_id
    tc.function.name = name
    tc.function.arguments = json.dumps(args)
    return tc


def _make_chat_response(content: str = "", tool_calls: list | None = None) -> MagicMock:
    choice = MagicMock()
    choice.message.content = content
    choice.message.tool_calls = tool_calls or []
    choice.message.model_dump.return_value = {
        "role": "assistant",
        "content": content,
        "tool_calls": [],
    }
    resp = MagicMock()
    resp.choices = [choice]
    return resp


# ── _extract_chart_data ────────────────────────────────────────────────────

def test_extract_chart_data_detects_time_series():
    from app.services.nl_query_service import _extract_chart_data

    tool_results = {
        "get_revenue_summary": {
            "daily_breakdown": [
                {"date": "2026-04-18", "revenue": 12000},
                {"date": "2026-04-19", "revenue": 15000},
                {"date": "2026-04-20", "revenue": 9500},
            ]
        }
    }
    chart = _extract_chart_data(tool_results)
    assert chart is not None
    assert chart["type"] == "line"
    assert len(chart["values"]) == 3


def test_extract_chart_data_returns_none_for_scalar():
    from app.services.nl_query_service import _extract_chart_data

    tool_results = {
        "get_expense_total": {"total": 45000, "category": "produce"}
    }
    chart = _extract_chart_data(tool_results)
    assert chart is None


def test_extract_chart_data_returns_none_for_empty():
    from app.services.nl_query_service import _extract_chart_data

    assert _extract_chart_data({}) is None


# ── _execute_tool ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_tool_expense_calls_finance_client():
    from app.services.nl_query_service import _execute_tool

    mock_result = {"total": 8500, "category": "produce"}

    with patch("app.services.nl_query_service.finance_client") as mock_finance:
        mock_finance.get_expense_total = AsyncMock(return_value=mock_result)
        result = await _execute_tool(
            "get_expense_total",
            {"category": "produce", "start_date": "2026-04-18", "end_date": "2026-04-25"},
            "tenant-abc",
        )

    assert result["total"] == 8500
    mock_finance.get_expense_total.assert_awaited_once()


@pytest.mark.asyncio
async def test_execute_tool_revenue_calls_finance_client():
    from app.services.nl_query_service import _execute_tool

    mock_result = {"total_revenue": 120000}

    with patch("app.services.nl_query_service.finance_client") as mock_finance:
        mock_finance.get_revenue_summary = AsyncMock(return_value=mock_result)
        result = await _execute_tool(
            "get_revenue_summary",
            {"start_date": "2026-04-01", "end_date": "2026-04-25"},
            "tenant-abc",
        )

    assert result["total_revenue"] == 120000


@pytest.mark.asyncio
async def test_execute_tool_waste_calls_inventory_client():
    from app.services.nl_query_service import _execute_tool

    mock_result = {"total_waste_value": 3200}

    with patch("app.services.nl_query_service.inventory_client") as mock_inv:
        mock_inv.get_waste_analysis = AsyncMock(return_value=mock_result)
        result = await _execute_tool(
            "get_waste_analysis",
            {"group_by": "item"},
            "tenant-abc",
        )

    assert result["total_waste_value"] == 3200


@pytest.mark.asyncio
async def test_execute_tool_unknown_returns_error():
    from app.services.nl_query_service import _execute_tool

    result = await _execute_tool("nonexistent_tool", {}, "tenant-abc")
    assert "error" in result
    assert "Unknown tool" in result["error"]


# ── process_query ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_query_calls_expense_tool():
    """'How much did we spend on vegetables this week?' → get_expense_total."""
    from app.services.nl_query_service import process_query

    tool_call = _make_tool_call(
        "get_expense_total",
        {"category": "produce", "start_date": "2026-04-18", "end_date": "2026-04-25"},
    )
    first_response = _make_chat_response(tool_calls=[tool_call])
    second_response = _make_chat_response(
        content="You spent ₹8,500 on produce this week."
    )

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = [first_response, second_response]

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.nl_query_service.settings") as s, \
         patch("app.services.nl_query_service.finance_client") as mock_finance, \
         patch("app.services.nl_query_service.inventory_client"):

        s.openai_api_key = "test-key"
        mock_finance.get_expense_total = AsyncMock(return_value={"total": 8500, "category": "produce"})

        result = await process_query("tenant-abc", "How much did we spend on vegetables this week?")

    assert "answer" in result
    assert "data" in result
    assert "₹8,500" in result["answer"] or "8,500" in result["answer"] or "8500" in result["answer"]


@pytest.mark.asyncio
async def test_process_query_no_tool_calls_returns_direct_answer():
    """Simple question where GPT answers without tool calls."""
    from app.services.nl_query_service import process_query

    direct_response = _make_chat_response(
        content="I need more context to answer that question.",
        tool_calls=[],
    )

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = direct_response

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.nl_query_service.settings") as s:
        s.openai_api_key = "test-key"
        result = await process_query("tenant-abc", "Hello?")

    assert "answer" in result
    assert "data" in result
    assert result["data"] == {}


@pytest.mark.asyncio
async def test_process_query_returns_chart_data_for_time_series():
    """Time-series revenue data triggers chart_data extraction."""
    from app.services.nl_query_service import process_query

    tool_call = _make_tool_call("get_revenue_summary", {"breakdown": "daily"})
    first_response = _make_chat_response(tool_calls=[tool_call])
    second_response = _make_chat_response(content="Here's your revenue trend.")

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = [first_response, second_response]

    revenue_data = {
        "daily_breakdown": [
            {"date": "2026-04-23", "revenue": 10000},
            {"date": "2026-04-24", "revenue": 12000},
            {"date": "2026-04-25", "revenue": 11000},
        ]
    }

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.nl_query_service.settings") as s, \
         patch("app.services.nl_query_service.finance_client") as mock_finance, \
         patch("app.services.nl_query_service.inventory_client"):

        s.openai_api_key = "test-key"
        mock_finance.get_revenue_summary = AsyncMock(return_value=revenue_data)
        result = await process_query("tenant-abc", "Show daily revenue this week")

    assert result.get("chart_data") is not None
    assert result["chart_data"]["type"] == "line"
