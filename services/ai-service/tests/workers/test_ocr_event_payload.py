"""
TDD tests for CRIT-03: ai.ocr.completed payload contract.

Ensures the published event includes both:
  - reference_id at top level (required by inventory listener)
  - line_items at top level (required by inventory listener)
  - result nested dict (for other consumers / auditability)

Also verifies that missing line_items in the OCR result produces an
empty list (not a KeyError), so the inventory listener can always
safely iterate line_items.
"""
import uuid
from unittest.mock import MagicMock, patch, call


def _make_ocr_result_with_line_items():
    return {
        "provider": "mindee",
        "document_type": "delivery_note",
        "vendor_name": "FreshFarms Co",
        "line_items": [
            {"description": "Onion", "quantity": 10.0, "unit_price": 50.0, "total_amount": 500.0},
            {"description": "Tomato", "quantity": 5.0, "unit_price": 30.0, "total_amount": 150.0},
        ],
    }


def _make_ocr_result_without_line_items():
    return {
        "provider": "google_vision",
        "document_type": "delivery_note",
        "raw_text": "some raw text",
    }


class TestOcrEventPayloadShape:
    """Validates the payload shape of the ai.ocr.completed event."""

    def test_published_event_includes_reference_id_at_top_level(self):
        """reference_id must be present at payload top level for inventory listener."""
        with patch("app.workers.tasks.publish_event") as mock_publish:
            from app.workers.tasks import _build_ocr_completed_payload

            reference_id = str(uuid.uuid4())
            result = _make_ocr_result_with_line_items()

            payload = _build_ocr_completed_payload(
                job_id="job-1",
                file_upload_id="file-1",
                reference_id=reference_id,
                document_type="delivery_note",
                result=result,
            )

            assert "reference_id" in payload, "reference_id must be at top level of payload"
            assert payload["reference_id"] == reference_id

    def test_published_event_includes_line_items_at_top_level(self):
        """line_items must be at payload top level for inventory listener prefill."""
        from app.workers.tasks import _build_ocr_completed_payload

        result = _make_ocr_result_with_line_items()
        payload = _build_ocr_completed_payload(
            job_id="job-1",
            file_upload_id="file-1",
            reference_id=str(uuid.uuid4()),
            document_type="delivery_note",
            result=result,
        )

        assert "line_items" in payload, "line_items must be at top level of payload"
        assert isinstance(payload["line_items"], list)
        assert len(payload["line_items"]) == 2

    def test_published_event_includes_nested_result_for_other_consumers(self):
        """result dict must still be present for auditability and other consumers."""
        from app.workers.tasks import _build_ocr_completed_payload

        result = _make_ocr_result_with_line_items()
        payload = _build_ocr_completed_payload(
            job_id="job-1",
            file_upload_id="file-1",
            reference_id=str(uuid.uuid4()),
            document_type="delivery_note",
            result=result,
        )

        assert "result" in payload, "result dict must be present in payload"
        assert payload["result"]["provider"] == "mindee"

    def test_missing_line_items_in_result_produces_empty_list(self):
        """When OCR result has no line_items, payload.line_items should be []."""
        from app.workers.tasks import _build_ocr_completed_payload

        result = _make_ocr_result_without_line_items()
        payload = _build_ocr_completed_payload(
            job_id="job-1",
            file_upload_id="file-1",
            reference_id=str(uuid.uuid4()),
            document_type="delivery_note",
            result=result,
        )

        assert payload["line_items"] == [], "Missing line_items in result must default to []"

    def test_document_type_at_top_level(self):
        """document_type must be present at top level (inventory listener uses it)."""
        from app.workers.tasks import _build_ocr_completed_payload

        result = _make_ocr_result_with_line_items()
        payload = _build_ocr_completed_payload(
            job_id="job-1",
            file_upload_id="file-1",
            reference_id=str(uuid.uuid4()),
            document_type="delivery_note",
            result=result,
        )

        assert payload["document_type"] == "delivery_note"
