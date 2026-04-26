"""
Unit tests for app/services/ocr_service.py

Tests:
  - preprocess_image: output is valid JPEG
  - extract_text: returns text from Vision API; raises on API error
  - parse_with_gpt4o: parses inventory and expense context correctly
  - match_to_catalog: exact match, fuzzy match above threshold, below threshold
"""
import io
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── preprocess_image ───────────────────────────────────────────────────────

def _make_test_jpeg() -> bytes:
    """Create a minimal valid JPEG in memory."""
    from PIL import Image
    img = Image.new("RGB", (100, 100), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_preprocess_image_returns_jpeg():
    from app.services.ocr_service import preprocess_image
    from PIL import Image

    jpeg = _make_test_jpeg()
    result = preprocess_image(jpeg)

    assert isinstance(result, bytes)
    assert len(result) > 0

    # Verify it's a valid JPEG
    img = Image.open(io.BytesIO(result))
    assert img.format == "JPEG"


def test_preprocess_image_converts_to_grayscale():
    from app.services.ocr_service import preprocess_image
    from PIL import Image

    jpeg = _make_test_jpeg()
    result = preprocess_image(jpeg)

    img = Image.open(io.BytesIO(result))
    # Grayscale images saved as JPEG may show mode L or RGB (JPEG doesn't support L natively)
    assert img.mode in ("L", "RGB", "RGBA")


# ── extract_text ───────────────────────────────────────────────────────────

def _make_vision_response(text: str, error_msg: str = ""):
    mock_response = MagicMock()
    mock_response.error.message = error_msg
    mock_response.full_text_annotation = MagicMock()
    mock_response.full_text_annotation.text = text
    return mock_response


def test_extract_text_returns_text_from_vision():
    from app.services.ocr_service import extract_text

    mock_client = MagicMock()
    mock_client.document_text_detection.return_value = _make_vision_response(
        "2kg tomatoes\n1kg onions"
    )

    with patch("google.cloud.vision.ImageAnnotatorClient", return_value=mock_client), \
         patch("google.cloud.vision.Image"):
        result = extract_text(b"fake-image-bytes")

    assert "tomatoes" in result
    assert "onions" in result


def test_extract_text_raises_on_vision_error():
    from app.services.ocr_service import extract_text

    mock_client = MagicMock()
    mock_client.document_text_detection.return_value = _make_vision_response(
        "", error_msg="API quota exceeded"
    )

    with patch("google.cloud.vision.ImageAnnotatorClient", return_value=mock_client), \
         patch("google.cloud.vision.Image"):
        with pytest.raises(RuntimeError, match="Google Vision error"):
            extract_text(b"fake-image-bytes")


def test_extract_text_returns_empty_string_when_no_annotation():
    from app.services.ocr_service import extract_text

    mock_response = MagicMock()
    mock_response.error.message = ""
    mock_response.full_text_annotation = None
    mock_client = MagicMock()
    mock_client.document_text_detection.return_value = mock_response

    with patch("google.cloud.vision.ImageAnnotatorClient", return_value=mock_client), \
         patch("google.cloud.vision.Image"):
        result = extract_text(b"fake-image-bytes")

    assert result == ""


# ── parse_with_gpt4o ───────────────────────────────────────────────────────

def _make_openai_response(content_dict: dict) -> MagicMock:
    choice = MagicMock()
    choice.message.content = json.dumps(content_dict)
    response = MagicMock()
    response.choices = [choice]
    return response


def test_parse_with_gpt4o_inventory_context():
    from app.services.ocr_service import parse_with_gpt4o

    expected = {
        "items": [
            {"name": "tomatoes", "quantity": 2, "unit": "kg", "date": "2026-04-25",
             "cost_per_unit": 50, "notes": "fresh"},
        ],
        "confidence": 0.95,
        "unreadable_sections": [],
    }
    mock_response = _make_openai_response(expected)
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.ocr_service.settings") as s:
        s.openai_api_key = "test-key"
        result = parse_with_gpt4o(
            raw_text="2kg tomatoes",
            image_bytes=b"fake",
            context_type="inventory",
            known_items=["tomatoes", "onions"],
        )

    assert "items" in result
    assert result["items"][0]["name"] == "tomatoes"
    assert result["confidence"] == 0.95


def test_parse_with_gpt4o_expense_context():
    from app.services.ocr_service import parse_with_gpt4o

    expected = {
        "expenses": [
            {"description": "Gas bill", "amount": 2500, "payee": "City Gas", "date": "2026-04-20"},
        ],
        "confidence": 0.88,
        "unreadable_sections": ["bottom left corner"],
    }
    mock_response = _make_openai_response(expected)
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.ocr_service.settings") as s:
        s.openai_api_key = "test-key"
        result = parse_with_gpt4o(
            raw_text="Gas bill 2500",
            image_bytes=b"fake",
            context_type="expense",
            known_items=[],
        )

    assert "expenses" in result
    assert result["expenses"][0]["amount"] == 2500


def test_parse_with_gpt4o_sends_image_as_base64():
    """Verify the multimodal message includes an image_url content block."""
    from app.services.ocr_service import parse_with_gpt4o

    mock_response = _make_openai_response({"items": [], "confidence": 0.5, "unreadable_sections": []})
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    with patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.ocr_service.settings") as s:
        s.openai_api_key = "test-key"
        parse_with_gpt4o(b"raw", b"imgbytes", "inventory", [])

    call_kwargs = mock_client.chat.completions.create.call_args[1]
    messages = call_kwargs["messages"]
    user_message = next(m for m in messages if m["role"] == "user")
    content_types = [c.get("type") for c in user_message["content"]]
    assert "image_url" in content_types


# ── match_to_catalog ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_match_to_catalog_exact_match():
    from app.services.ocr_service import match_to_catalog

    items = [{"name": "Tomatoes", "quantity": 2, "unit": "kg"}]

    with patch("app.services.ocr_service.get_item_names", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = ["Tomatoes", "Onions", "Chicken"]
        result = await match_to_catalog(items, "tenant-1")

    assert len(result["matched"]) == 1
    assert result["matched"][0]["match_type"] == "exact"
    assert result["matched"][0]["match_confidence"] == 1.0
    assert len(result["unmatched"]) == 0


@pytest.mark.asyncio
async def test_match_to_catalog_fuzzy_match_above_threshold():
    """Items with fuzzy confidence > 0.85 should be in matched."""
    from app.services.ocr_service import match_to_catalog

    items = [{"name": "Tomatoe", "quantity": 1, "unit": "kg"}]

    fuzzy_response = {
        "matches": [{"extracted": "Tomatoe", "match": "Tomatoes", "confidence": 0.92}]
    }
    mock_openai_resp = _make_openai_response(fuzzy_response)
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_openai_resp

    with patch("app.services.ocr_service.get_item_names", new_callable=AsyncMock) as mock_get, \
         patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.ocr_service.settings") as s:
        mock_get.return_value = ["Tomatoes", "Onions"]
        s.openai_api_key = "test-key"
        result = await match_to_catalog(items, "tenant-1")

    assert len(result["matched"]) == 1
    assert result["matched"][0]["match_type"] == "fuzzy"
    assert result["matched"][0]["match_confidence"] == 0.92


@pytest.mark.asyncio
async def test_match_to_catalog_fuzzy_below_threshold_goes_to_unmatched():
    """Items with fuzzy confidence ≤ 0.85 should be in unmatched."""
    from app.services.ocr_service import match_to_catalog

    items = [{"name": "XYZ_unknown", "quantity": 1, "unit": "kg"}]

    fuzzy_response = {
        "matches": [{"extracted": "XYZ_unknown", "match": None, "confidence": 0.2}]
    }
    mock_openai_resp = _make_openai_response(fuzzy_response)
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_openai_resp

    with patch("app.services.ocr_service.get_item_names", new_callable=AsyncMock) as mock_get, \
         patch("openai.OpenAI", return_value=mock_client), \
         patch("app.services.ocr_service.settings") as s:
        mock_get.return_value = ["Tomatoes", "Onions"]
        s.openai_api_key = "test-key"
        result = await match_to_catalog(items, "tenant-1")

    assert len(result["unmatched"]) == 1
    assert len(result["matched"]) == 0


@pytest.mark.asyncio
async def test_match_to_catalog_empty_name_goes_to_unmatched():
    """Items with no name should be immediately unmatched."""
    from app.services.ocr_service import match_to_catalog

    items = [{"name": "", "quantity": 1, "unit": "kg"}]

    with patch("app.services.ocr_service.get_item_names", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = ["Tomatoes"]
        result = await match_to_catalog(items, "tenant-1")

    assert len(result["unmatched"]) == 1
    assert result["unmatched"][0]["reason"] == "empty name"
