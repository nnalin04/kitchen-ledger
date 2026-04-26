"""
Voice Transcription Service.

Pipeline:
  1. transcribe    — OpenAI Whisper (whisper-1) with domain prompt
  2. parse_command — GPT-4o-mini structured extraction per command type
"""
from __future__ import annotations

import json
import logging
from typing import Any, Literal

logger = logging.getLogger(__name__)

from app.core.config import settings  # noqa: E402

DOMAIN_PROMPT = (
    "Restaurant kitchen context. Common ingredients: chicken, tomatoes, onions, "
    "cream, flour, rice, dal, paneer. Quantities in kg, grams, litres, pieces."
)

COMMAND_SCHEMAS: dict[str, str] = {
    "waste": (
        "Extract: item (string), quantity (number), unit (string: kg/g/litres/pieces), "
        "reason (string), station (string or null). "
        'Return JSON: {"item": ..., "quantity": ..., "unit": ..., "reason": ..., "station": ...}'
    ),
    "stock_count": (
        "Extract: item (string), quantity (number), unit (string: kg/g/litres/pieces). "
        'Return JSON: {"item": ..., "quantity": ..., "unit": ...}'
    ),
    "receipt": (
        "Extract: item (string), quantity (number), unit (string: kg/g/litres/pieces), "
        "cost_per_unit (number or null). "
        'Return JSON: {"item": ..., "quantity": ..., "unit": ..., "cost_per_unit": ...}'
    ),
}


def transcribe(audio_bytes: bytes, language: str = "en") -> str:
    """Transcribe audio via OpenAI Whisper whisper-1.

    Uses a domain-specific prompt to improve ingredient recognition.
    Returns the transcript as a plain string.
    """
    import io
    from openai import OpenAI

    if not audio_bytes:
        raise ValueError("audio_bytes cannot be empty")

    client = OpenAI(api_key=settings.openai_api_key)

    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = "audio.wav"  # Whisper needs a filename with extension

    response = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        language=language,
        prompt=DOMAIN_PROMPT,
        response_format="text",
    )
    return str(response).strip()


def parse_command(
    transcript: str,
    command_type: Literal["waste", "stock_count", "receipt"],
    known_items: list[str] | None = None,
) -> dict[str, Any]:
    """Parse a transcript into a structured command using GPT-4o-mini.

    Returns a dict matching the schema for the given command_type.
    Uses temperature=0 for deterministic extraction.
    """
    from openai import OpenAI

    schema_hint = COMMAND_SCHEMAS.get(command_type, "")
    item_hint = ""
    if known_items:
        item_hint = f" Known items: {', '.join(known_items[:30])}."

    system_prompt = (
        f"You are a kitchen assistant extracting structured data from voice commands. "
        f"{schema_hint}{item_hint} "
        "Return only valid JSON matching the schema. "
        "If a field cannot be determined, use null."
    )

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        temperature=0,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": transcript},
        ],
    )

    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("parse_command: JSON decode failed (%s), returning empty result", exc)
        parsed = {}

    # Ensure quantity is numeric
    if "quantity" in parsed and parsed["quantity"] is not None:
        try:
            parsed["quantity"] = float(parsed["quantity"])
        except (ValueError, TypeError):
            parsed["quantity"] = None

    return parsed


def compute_confidence(parsed: dict[str, Any], command_type: str) -> float:
    """Compute a simple confidence score based on required fields being present."""
    required: dict[str, list[str]] = {
        "waste": ["item", "quantity", "unit"],
        "stock_count": ["item", "quantity", "unit"],
        "receipt": ["item", "quantity", "unit"],
    }
    fields = required.get(command_type, [])
    if not fields:
        return 0.5
    filled = sum(1 for f in fields if parsed.get(f) is not None)
    return round(filled / len(fields), 2)
