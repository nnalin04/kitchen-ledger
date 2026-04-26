"""
Unit tests for app/services/voice_service.py

Tests:
  - transcribe: returns transcript string from Whisper mock
  - parse_command: returns correct schema for each command type
  - compute_confidence: scores based on required fields
"""
import json
import pytest
from unittest.mock import MagicMock, patch


# ── Helpers ────────────────────────────────────────────────────────────────

def _make_openai_chat_response(content: dict) -> MagicMock:
    choice = MagicMock()
    choice.message.content = json.dumps(content)
    resp = MagicMock()
    resp.choices = [choice]
    return resp


# ── transcribe ─────────────────────────────────────────────────────────────

def test_transcribe_returns_string():
    from app.services.voice_service import transcribe

    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.return_value = "two kilos tomatoes spoiled"

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.voice_service.settings") as s:
        s.openai_api_key = "test-key"
        result = transcribe(b"audio-bytes", language="en")

    assert isinstance(result, str)
    assert "tomatoes" in result


def test_transcribe_passes_domain_prompt():
    from app.services.voice_service import transcribe, DOMAIN_PROMPT

    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.return_value = "transcript"

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.voice_service.settings") as s:
        s.openai_api_key = "test-key"
        transcribe(b"audio", language="en")

    call_kwargs = mock_client.audio.transcriptions.create.call_args[1]
    assert call_kwargs["prompt"] == DOMAIN_PROMPT
    assert call_kwargs["model"] == "whisper-1"


def test_transcribe_passes_language():
    from app.services.voice_service import transcribe

    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.return_value = "dos kilos tomates"

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.voice_service.settings") as s:
        s.openai_api_key = "test-key"
        transcribe(b"audio", language="es")

    call_kwargs = mock_client.audio.transcriptions.create.call_args[1]
    assert call_kwargs["language"] == "es"


# ── parse_command — waste ──────────────────────────────────────────────────

def test_parse_command_waste_returns_correct_schema():
    from app.services.voice_service import parse_command

    expected = {
        "item": "tomatoes",
        "quantity": 2.0,
        "unit": "kg",
        "reason": "spoilage",
        "station": "prep",
    }
    mock_resp = _make_openai_chat_response(expected)
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.voice_service.settings") as s:
        s.openai_api_key = "test-key"
        result = parse_command("two kilos tomatoes spoiled", "waste", ["tomatoes", "chicken"])

    assert result["item"] == "tomatoes"
    assert result["quantity"] == 2.0
    assert result["unit"] == "kg"
    assert "reason" in result
    assert "station" in result


def test_parse_command_waste_quantity_coerced_to_float():
    """Quantity returned as string by GPT should be coerced to float."""
    from app.services.voice_service import parse_command

    raw = {"item": "onions", "quantity": "3", "unit": "kg", "reason": "over-ordered", "station": None}
    mock_resp = _make_openai_chat_response(raw)
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.voice_service.settings") as s:
        s.openai_api_key = "test-key"
        result = parse_command("3 kg onions over-ordered", "waste")

    assert isinstance(result["quantity"], float)
    assert result["quantity"] == 3.0


# ── parse_command — stock_count ────────────────────────────────────────────

def test_parse_command_stock_count_returns_correct_schema():
    from app.services.voice_service import parse_command

    expected = {"item": "chicken breast", "quantity": 5.5, "unit": "kg"}
    mock_resp = _make_openai_chat_response(expected)
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.voice_service.settings") as s:
        s.openai_api_key = "test-key"
        result = parse_command("five point five kilos chicken breast", "stock_count")

    assert result["item"] == "chicken breast"
    assert result["quantity"] == 5.5
    assert result["unit"] == "kg"


# ── parse_command — receipt ────────────────────────────────────────────────

def test_parse_command_receipt_returns_correct_schema():
    from app.services.voice_service import parse_command

    expected = {"item": "cream", "quantity": 10, "unit": "litres", "cost_per_unit": 120}
    mock_resp = _make_openai_chat_response(expected)
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.voice_service.settings") as s:
        s.openai_api_key = "test-key"
        result = parse_command("ten litres cream at one twenty per litre", "receipt")

    assert result["item"] == "cream"
    assert "quantity" in result
    assert "unit" in result
    assert "cost_per_unit" in result


def test_parse_command_uses_temperature_zero():
    from app.services.voice_service import parse_command

    mock_resp = _make_openai_chat_response({"item": "x", "quantity": 1, "unit": "kg"})
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.voice_service.settings") as s:
        s.openai_api_key = "test-key"
        parse_command("one kilo x", "stock_count")

    call_kwargs = mock_client.chat.completions.create.call_args[1]
    assert call_kwargs["temperature"] == 0


# ── compute_confidence ─────────────────────────────────────────────────────

def test_compute_confidence_all_fields_present():
    from app.services.voice_service import compute_confidence

    parsed = {"item": "tomatoes", "quantity": 2.0, "unit": "kg", "reason": "spoilage", "station": None}
    score = compute_confidence(parsed, "waste")
    assert score == 1.0


def test_compute_confidence_partial_fields():
    from app.services.voice_service import compute_confidence

    parsed = {"item": "tomatoes", "quantity": None, "unit": None}
    score = compute_confidence(parsed, "stock_count")
    # 1 out of 3 required fields present
    assert score == pytest.approx(1 / 3, abs=0.01)


def test_compute_confidence_no_required_fields():
    from app.services.voice_service import compute_confidence

    parsed = {}
    score = compute_confidence(parsed, "stock_count")
    assert score == 0.0
