"""
Voice Transcription Service — Sarvam AI (Indian languages).

Pipeline:
  1. transcribe    — Sarvam saarika:v2 ASR (hi-IN, ta-IN, te-IN, kn-IN, etc.)
  2. translate     — Sarvam saaras:v2 (non-English audio → English transcript)
  3. parse_command — regex + unit normalisation, no external LLM required
"""
from __future__ import annotations

import io
import json
import logging
import re
from typing import Any, Literal

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SARVAM_ASR_URL = "https://api.sarvam.ai/speech-to-text"
SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/speech-to-text-translate"

# Languages supported by Sarvam saarika:v2
SARVAM_LANGUAGES = {
    "hi", "hi-IN",   # Hindi
    "bn", "bn-IN",   # Bengali
    "gu", "gu-IN",   # Gujarati
    "kn", "kn-IN",   # Kannada
    "ml", "ml-IN",   # Malayalam
    "mr", "mr-IN",   # Marathi
    "od", "od-IN",   # Odia
    "pa", "pa-IN",   # Punjabi
    "ta", "ta-IN",   # Tamil
    "te", "te-IN",   # Telugu
    "en", "en-IN",   # Indian English
}

# ── Unit normalisation ─────────────────────────────────────────────────────────
# Maps raw tokens (including Hindi/Hinglish terms) → canonical unit strings

UNIT_MAP: dict[str, str] = {
    # Weight
    "kg": "kg", "kgs": "kg", "kilo": "kg", "kilos": "kg",
    "kilogram": "kg", "kilograms": "kg",
    "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g",
    "mg": "mg", "milligram": "mg", "milligrams": "mg",
    "quintal": "quintal",
    # Volume
    "l": "l", "lt": "l", "ltr": "l", "litre": "l", "litres": "l",
    "liter": "l", "liters": "l",
    "ml": "ml", "millilitre": "ml", "milliliter": "ml",
    # Count
    "pcs": "pcs", "pc": "pcs", "piece": "pcs", "pieces": "pcs",
    "nos": "pcs", "no": "pcs", "number": "pcs", "numbers": "pcs",
    "dozen": "dozen", "dozens": "dozen",
    "packet": "pkt", "packets": "pkt", "pkt": "pkt", "pack": "pkt",
    "box": "box", "boxes": "box",
    "bottle": "bottle", "bottles": "bottle",
    "tin": "tin", "tins": "tin",
    "bag": "bag", "bags": "bag",
    "tray": "tray", "trays": "tray",
    "bunch": "bunch", "bunches": "bunch",
}

# Special shorthand quantities (Indian kitchen context)
QUANTITY_SHORTCUTS: dict[str, tuple[float, str]] = {
    "pav": (0.25, "kg"),       # quarter kg
    "paav": (0.25, "kg"),
    "aadha": (0.5, "kg"),      # half kg (followed by "kilo/kg")
    "adha": (0.5, "kg"),
    "sawa": (1.25, "kg"),      # sawa kilo = 1.25 kg
    "dedh": (1.5, "kg"),       # dedh kilo = 1.5 kg
    "dhhai": (2.5, "kg"),      # dhai kilo = 2.5 kg
}

# Number words → digits
NUMBER_WORDS: dict[str, float] = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4,
    "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15,
    "twenty": 20, "twenty-five": 25, "thirty": 30,
    "fifty": 50, "hundred": 100, "half": 0.5, "quarter": 0.25,
    # Hindi number words (transliterated)
    "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5,
    "che": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
    "bees": 20, "pachees": 25, "tees": 30, "pachas": 50,
    "sau": 100,
}

COMMAND_REQUIRED: dict[str, list[str]] = {
    "waste":       ["item", "quantity", "unit"],
    "stock_count": ["item", "quantity", "unit"],
    "receipt":     ["item", "quantity", "unit"],
}


# ── Sarvam API calls ───────────────────────────────────────────────────────────

def transcribe(audio_bytes: bytes, language: str = "hi-IN") -> str:
    """Transcribe audio using Sarvam saarika:v2.

    For non-English Indian languages, also fetches an English translation
    via saaras:v2 so the downstream parser always receives English text.

    Returns the transcript (English if translated, otherwise original language).
    """
    if not audio_bytes:
        raise ValueError("audio_bytes cannot be empty")

    lang_code = _normalise_lang(language)
    headers = {"api-subscription-key": settings.sarvam_api_key}

    # Use translate endpoint for Indian languages so parser gets English output.
    is_english = lang_code in ("en", "en-IN", "en-US")
    url = SARVAM_ASR_URL if is_english else SARVAM_TRANSLATE_URL
    model = "saarika:v2" if is_english else "saaras:v2"

    files = {
        "file": ("audio.wav", io.BytesIO(audio_bytes), "audio/wav"),
    }
    data = {
        "model": model,
        "language_code": lang_code,
        "with_timestamps": "false",
    }

    response = httpx.post(url, headers=headers, files=files, data=data, timeout=30)
    response.raise_for_status()
    body = response.json()

    # saarika returns {"transcript": "..."}, saaras returns {"transcript": "..."}
    transcript = body.get("transcript") or body.get("transcription") or ""
    if not transcript:
        logger.warning("Sarvam returned empty transcript: %s", body)
    return transcript.strip()


def _normalise_lang(language: str) -> str:
    """Normalise language code to Sarvam format (e.g. 'hi' → 'hi-IN')."""
    if language in SARVAM_LANGUAGES:
        return language
    # Try adding -IN suffix
    candidate = f"{language}-IN"
    if candidate in SARVAM_LANGUAGES:
        return candidate
    # Default to Hindi
    logger.warning("Unrecognised language %r, defaulting to hi-IN", language)
    return "hi-IN"


# ── Command parser (regex-based, no LLM) ──────────────────────────────────────

def parse_command(
    transcript: str,
    command_type: Literal["waste", "stock_count", "receipt"],
    known_items: list[str] | None = None,
) -> dict[str, Any]:
    """Extract structured fields from an English transcript.

    Handles:
    - "add 2 kg of tomatoes"
    - "waste 500 grams paneer — spoiled"
    - "received 10 litres milk at 60 rupees"
    - "5 dozen eggs"

    Returns a dict with keys matching COMMAND_SCHEMAS for the given type.
    """
    text = transcript.lower().strip()

    # Replace number words with digits
    text = _replace_number_words(text)

    quantity, unit = _extract_quantity_unit(text)
    item = _extract_item(text, quantity, unit, known_items or [])

    result: dict[str, Any] = {
        "item": item,
        "quantity": quantity,
        "unit": unit,
    }

    if command_type == "waste":
        result["reason"] = _extract_reason(transcript)
        result["station"] = None
    elif command_type == "receipt":
        result["cost_per_unit"] = _extract_cost(transcript)

    return result


def _replace_number_words(text: str) -> str:
    for word, val in sorted(NUMBER_WORDS.items(), key=lambda x: -len(x[0])):
        pattern = rf"\b{re.escape(word)}\b"
        text = re.sub(pattern, str(val), text)
    return text


def _extract_quantity_unit(text: str) -> tuple[float | None, str | None]:
    """Find the first number + unit pair in the text."""
    # Check for Indian shorthand first (pav, aadha, etc.)
    for shorthand, (qty, unit) in QUANTITY_SHORTCUTS.items():
        if re.search(rf"\b{shorthand}\b", text):
            # Check if followed by explicit kg/kilo
            modified_qty = qty
            if re.search(rf"\b{shorthand}\b\s*(kilo|kg)\b", text):
                modified_qty = qty  # already in kg
            return modified_qty, unit

    # Standard: number followed by unit
    unit_pattern = "|".join(re.escape(u) for u in sorted(UNIT_MAP, key=len, reverse=True))
    pattern = rf"(\d+(?:\.\d+)?)\s*({unit_pattern})\b"
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        raw_qty = float(match.group(1))
        raw_unit = match.group(2).lower()
        return raw_qty, UNIT_MAP.get(raw_unit, raw_unit)

    # Number without unit (assume "pieces")
    num_match = re.search(r"(\d+(?:\.\d+)?)", text)
    if num_match:
        return float(num_match.group(1)), "pcs"

    return None, None


def _extract_item(
    text: str,
    quantity: float | None,
    unit: str | None,
    known_items: list[str],
) -> str | None:
    # Remove filler words and the quantity/unit we already found
    stopwords = {
        "add", "added", "received", "receive", "got", "waste", "wasted",
        "spoiled", "damaged", "stock", "count", "update", "log", "record",
        "of", "the", "a", "an", "and", "is", "was", "for", "at", "in",
        "rupees", "rs", "cost", "price", "per", "kg", "gram", "litre",
    }
    if unit:
        stopwords.add(unit.lower())

    tokens = text.split()
    filtered = []
    skip_next = False
    for tok in tokens:
        if skip_next:
            skip_next = False
            continue
        tok_clean = re.sub(r"[^\w]", "", tok)
        # Skip numbers
        if re.fullmatch(r"\d+(\.\d+)?", tok_clean):
            skip_next = True  # skip unit after number
            continue
        if tok_clean.lower() in stopwords or not tok_clean:
            continue
        filtered.append(tok_clean)

    candidate = " ".join(filtered).strip()

    if not candidate:
        return None

    # Try exact match against known catalog (case-insensitive)
    if known_items:
        candidate_lower = candidate.lower()
        for name in known_items:
            if name.lower() == candidate_lower:
                return name
        # Fuzzy match via difflib
        from difflib import get_close_matches
        matches = get_close_matches(candidate_lower, [n.lower() for n in known_items], n=1, cutoff=0.7)
        if matches:
            idx = [n.lower() for n in known_items].index(matches[0])
            return known_items[idx]

    return candidate.title()


def _extract_reason(transcript: str) -> str | None:
    """Extract waste reason from transcript (after 'because', 'due to', dash, etc.)."""
    patterns = [
        r"(?:because|due to|reason[:\s]+|—|-)\s*(.+)$",
        r"(?:spoiled|damaged|expired|broken|burnt|overcooked)\b",
    ]
    for p in patterns:
        m = re.search(p, transcript, re.IGNORECASE)
        if m:
            return (m.group(1) if m.lastindex else m.group(0)).strip()
    return None


def _extract_cost(transcript: str) -> float | None:
    """Extract price per unit from receipt transcript."""
    patterns = [
        r"(?:at|@|cost|price|rs\.?|₹)\s*(\d+(?:\.\d+)?)",
        r"(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?|₹)\s*(?:per|each|a|/)",
    ]
    for p in patterns:
        m = re.search(p, transcript, re.IGNORECASE)
        if m:
            return float(m.group(1))
    return None


# ── Confidence score ───────────────────────────────────────────────────────────

def compute_confidence(parsed: dict[str, Any], command_type: str) -> float:
    """Fraction of required fields that are non-null."""
    fields = COMMAND_REQUIRED.get(command_type, [])
    if not fields:
        return 0.5
    filled = sum(1 for f in fields if parsed.get(f) is not None)
    return round(filled / len(fields), 2)
