"""
Real unit tests for OCR extraction logic in tasks.py.
These tests mock the external providers (Mindee, Google Vision) but exercise
the actual field-extraction and transformation code in _run_mindee_ocr and
_run_google_vision_ocr rather than mocking non-existent functions.
"""
import pytest
from unittest.mock import MagicMock, patch


# ── Helpers to build realistic Mindee mock responses ──────────────────────


def _make_prediction_field(value):
    """Create a minimal field mock that .value returns the given Python value."""
    m = MagicMock()
    m.value = value
    m.__str__ = MagicMock(return_value=str(value))
    return m


def _make_none_field():
    """Simulate an optional Mindee field that has no detected value (Mindee returns None)."""
    return None


def _make_invoice_line_item(description, quantity, unit_price, total_amount):
    item = MagicMock()
    item.description = _make_prediction_field(description)
    item.quantity = _make_prediction_field(quantity)
    item.unit_price = _make_prediction_field(unit_price)
    item.total_amount = _make_prediction_field(total_amount)
    return item


# ── Tests for _run_mindee_ocr (invoice path) ───────────────────────────────


@patch("app.workers.tasks.settings")
def test_extract_supplier_name_from_invoice_text(mock_settings):
    """Given OCR of an invoice, verify the vendor name is correctly extracted."""
    from app.workers.tasks import _run_mindee_ocr

    pred = MagicMock()
    pred.supplier_name = _make_prediction_field("Produce Plus Ltd")
    pred.date = _make_prediction_field("2026-04-15")
    pred.invoice_number = _make_prediction_field("INV-0042")
    pred.total_amount = _make_prediction_field(3500.00)
    pred.total_tax = _make_none_field()
    pred.line_items = []

    mock_result = MagicMock()
    mock_result.document.inference.prediction = pred

    mock_client = MagicMock()
    mock_client.parse.return_value = mock_result

    with patch("mindee.Client", return_value=mock_client), \
         patch("mindee.product"):
        result = _run_mindee_ocr(b"fake-pdf-bytes", "invoice")

    assert result["vendor_name"] == "Produce Plus Ltd"
    assert result["document_type"] == "invoice"
    assert result["invoice_number"] == "INV-0042"
    assert result["total_amount"] == "3500.0"  # M-1 fix: monetary fields are strings to avoid float rounding


@patch("app.workers.tasks.settings")
def test_extract_line_items_from_invoice_text(mock_settings):
    """Given OCR of an invoice with line items, verify items, quantities, prices are correct."""
    from app.workers.tasks import _run_mindee_ocr

    line_items = [
        _make_invoice_line_item("Chicken Breast", 10.0, 250.00, 2500.00),
        _make_invoice_line_item("Basmati Rice (5kg)", 5.0, 350.00, 1750.00),
    ]

    pred = MagicMock()
    pred.supplier_name = _make_prediction_field("Meat & Grain Direct")
    pred.date = _make_prediction_field("2026-04-15")
    pred.invoice_number = _make_prediction_field("MGD-2026-001")
    pred.total_amount = _make_prediction_field(4250.00)
    pred.total_tax = _make_prediction_field(765.00)
    pred.line_items = line_items

    mock_result = MagicMock()
    mock_result.document.inference.prediction = pred

    mock_client = MagicMock()
    mock_client.parse.return_value = mock_result

    with patch("mindee.Client", return_value=mock_client), \
         patch("mindee.product"):
        result = _run_mindee_ocr(b"fake-pdf-bytes", "invoice")

    assert len(result["line_items"]) == 2
    assert result["line_items"][0]["description"] == "Chicken Breast"
    assert result["line_items"][0]["quantity"] == 10.0  # quantity stays float
    assert result["line_items"][0]["unit_price"] == "250.0"  # monetary → string
    assert result["line_items"][1]["description"] == "Basmati Rice (5kg)"
    assert result["tax_amount"] == "765.0"  # monetary → string


@patch("app.workers.tasks.settings")
def test_extract_handwritten_inventory_count(mock_settings):
    """
    Google Vision's full_text is used for handwritten documents.
    Verify the raw text and page count are preserved in the result.
    """
    full_text = "Tomatoes: 5 kg\nOnions: 10 kg\nPotatoes: 8 kg"

    mock_page = MagicMock()
    mock_annotation = MagicMock()
    mock_annotation.text = full_text
    mock_annotation.pages = [mock_page]

    mock_response = MagicMock()
    mock_response.error.message = ""
    mock_response.full_text_annotation = mock_annotation

    mock_vision_client = MagicMock()
    mock_vision_client.document_text_detection.return_value = mock_response

    with patch("google.cloud.vision.ImageAnnotatorClient", return_value=mock_vision_client):
        from app.workers.tasks import _run_google_vision_ocr
        result = _run_google_vision_ocr(b"fake-image-bytes")

    assert result["provider"] == "google_vision"
    assert "Tomatoes: 5 kg" in result["full_text"]
    assert result["pages"] == 1


@patch("app.workers.tasks.settings")
def test_handle_low_confidence_ocr_result(mock_settings):
    """
    When Mindee returns None for optional fields (low-confidence detection),
    the transformation should yield None values without raising exceptions.
    """
    from app.workers.tasks import _run_mindee_ocr

    pred = MagicMock()
    pred.supplier_name = _make_none_field()   # Not detected
    pred.date = _make_none_field()            # Not detected
    pred.invoice_number = _make_none_field()  # Not detected
    pred.total_amount = _make_none_field()
    pred.total_tax = _make_none_field()
    pred.line_items = []

    mock_result = MagicMock()
    mock_result.document.inference.prediction = pred

    mock_client = MagicMock()
    mock_client.parse.return_value = mock_result

    with patch("mindee.Client", return_value=mock_client), \
         patch("mindee.product"):
        result = _run_mindee_ocr(b"unclear-image", "invoice")

    # Should not raise; optional fields are None
    assert result["vendor_name"] is None
    assert result["total_amount"] is None
    assert result["line_items"] == []
    assert result["document_type"] == "invoice"


def test_handle_empty_ocr_result():
    """
    Google Vision returning an error message raises a RuntimeError.
    Empty text annotation returns empty full_text and 0 pages.
    """
    from app.workers.tasks import _run_google_vision_ocr

    # Case 1: provider error
    mock_response_err = MagicMock()
    mock_response_err.error.message = "The provider returned an error"
    mock_response_err.full_text_annotation = None

    mock_client_err = MagicMock()
    mock_client_err.document_text_detection.return_value = mock_response_err

    with patch("google.cloud.vision.ImageAnnotatorClient", return_value=mock_client_err):
        with pytest.raises(RuntimeError, match="Google Vision error"):
            _run_google_vision_ocr(b"blank-image")

    # Case 2: successful response but no text detected
    mock_response_empty = MagicMock()
    mock_response_empty.error.message = ""
    mock_response_empty.full_text_annotation = None

    mock_client_empty = MagicMock()
    mock_client_empty.document_text_detection.return_value = mock_response_empty

    with patch("google.cloud.vision.ImageAnnotatorClient", return_value=mock_client_empty):
        result = _run_google_vision_ocr(b"blank-image")

    assert result["full_text"] == ""
    assert result["pages"] == 0
