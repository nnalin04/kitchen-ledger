"""
Unit tests for the NLP / voice-query interpretation logic in tasks.py.
Tests that _interpret_query_with_openai correctly parses OpenAI JSON responses
and returns the right intent, filters, and suggestion.
"""
import json
import pytest
from unittest.mock import MagicMock, patch


def _make_openai_response(intent: str, filters: dict, suggestion: str):
    """Build a minimal mock of the OpenAI chat completion response object."""
    content = json.dumps({
        "intent": intent,
        "filters": filters,
        "suggestion": suggestion,
    })
    choice = MagicMock()
    choice.message.content = content

    response = MagicMock()
    response.choices = [choice]
    return response


# ── Tests ──────────────────────────────────────────────────────────────────


def test_expense_query_routes_to_get_expenses_function():
    """
    'Show me all expenses from this week' should produce intent='get_expenses'
    with appropriate time filters.
    """
    from app.workers.tasks import _interpret_query_with_openai

    mock_response = _make_openai_response(
        intent="get_expenses",
        filters={"date_range": "this_week"},
        suggestion="Showing all expenses recorded this week",
    )

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.workers.tasks.settings") as mock_settings:
        mock_settings.openai_api_key = "test-key"
        result = _interpret_query_with_openai(
            "Show me all expenses from this week", None
        )

    assert result["intent"] == "get_expenses"
    assert result["filters"]["date_range"] == "this_week"
    assert "expenses" in result["suggestion"].lower()
    assert result["original_query"] == "Show me all expenses from this week"


def test_inventory_query_routes_to_get_inventory_summary():
    """
    'What vegetables are running low?' should produce intent='get_low_stock'
    with category filter.
    """
    from app.workers.tasks import _interpret_query_with_openai

    mock_response = _make_openai_response(
        intent="get_low_stock",
        filters={"category": "vegetables"},
        suggestion="Showing vegetables below PAR level",
    )

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.workers.tasks.settings") as mock_settings:
        mock_settings.openai_api_key = "test-key"
        result = _interpret_query_with_openai(
            "What vegetables are running low?", "inventory"
        )

    assert result["intent"] == "get_low_stock"
    assert result["filters"]["category"] == "vegetables"
    assert result["original_query"] == "What vegetables are running low?"


def test_ambiguous_query_asks_for_clarification():
    """
    When OpenAI cannot determine intent, it returns intent='unknown'.
    _interpret_query_with_openai should surface this without raising.
    """
    from app.workers.tasks import _interpret_query_with_openai

    mock_response = _make_openai_response(
        intent="unknown",
        filters={},
        suggestion="I'm not sure what you're looking for. Could you be more specific?",
    )

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.workers.tasks.settings") as mock_settings:
        mock_settings.openai_api_key = "test-key"
        result = _interpret_query_with_openai(
            "aaabbbccc", None
        )

    assert result["intent"] == "unknown"
    assert result["filters"] == {}
    assert "specific" in result["suggestion"].lower()
    assert result["original_query"] == "aaabbbccc"


def test_nlp_passes_context_to_system_prompt():
    """
    When a context string is supplied, it should be included in the OpenAI call.
    """
    from app.workers.tasks import _interpret_query_with_openai

    mock_response = _make_openai_response(
        intent="get_sales",
        filters={"period": "today"},
        suggestion="Showing today's sales data",
    )

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.workers.tasks.settings") as mock_settings:
        mock_settings.openai_api_key = "test-key"
        result = _interpret_query_with_openai(
            "How did we do today?", "finance"
        )

    # Verify context was forwarded in the messages
    call_kwargs = mock_client.chat.completions.create.call_args
    messages = call_kwargs[1]["messages"]
    system_content = next(m["content"] for m in messages if m["role"] == "system")
    assert "finance" in system_content
