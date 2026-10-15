"""Permit text → structured fields.

Order: live LLM (only when `LLM_MODE=live`) → cached fixture (exact sample text) → deterministic
rules. The LLM only reads text; it never produces coordinates (geocoding is 2B, deterministic).
"""

import json
import logging
import re
from datetime import date
from typing import Any

from app.config import Settings, get_settings
from app.data.gazetteer import JUNCTIONS, LANDMARKS, STREETS
from app.models.enums import Utility, WorkType
from app.permits.models import (
    FIELD_NAMES,
    SIDES,
    ExtractedField,
    ExtractionResult,
    ExtractionUnavailable,
    build_result,
)
from app.permits.rules_extract import extract_with_rules
from app.permits.sample_permits import SAMPLE_PERMITS

log = logging.getLogger(__name__)

LLM_TIMEOUT_S = 10.0
TOOL_NAME = "record_permit_fields"

_NUMERIC = {"offset_m", "depth_from_m", "depth_to_m", "width_m", "diameter_m"}
_DATES = {"start_date", "end_date"}
_FIELD_HELP = {
    "agency": "Issuing agency / applicant name as written.",
    "permit_no": "Permit number as written.",
    "work_type": f"One of {[w.value for w in WorkType]}.",
    "utility": f"One of {[u.value for u in Utility]}.",
    "street": "Street ID (ST-xx) from the gazetteer.",
    "from_ref": "Start junction (JN-xx) or landmark (LM-xx) ID from the gazetteer.",
    "to_ref": "End junction (JN-xx) or landmark (LM-xx) ID from the gazetteer.",
    "side": f"One of {list(SIDES)}.",
    "offset_m": "Offset from the street centreline in metres.",
    "depth_from_m": "Top of excavation below ground, metres (0 for open cut from surface).",
    "depth_to_m": "Bottom of excavation below ground, metres.",
    "width_m": "Trench / pit width in metres.",
    "diameter_m": "Pipe / duct diameter in metres (convert mm to m).",
    "start_date": "Work start, ISO date YYYY-MM-DD.",
    "end_date": "Work end, ISO date YYYY-MM-DD.",
}


def _squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def load_fixture(text: str) -> ExtractionResult | None:
    """Cached extraction for a demo permit (exact text match, whitespace-insensitive)."""
    wanted = _squash(text).casefold()
    for sample in SAMPLE_PERMITS:
        if _squash(sample.text).casefold() == wanted and sample.fixture_path.exists():
            data = json.loads(sample.fixture_path.read_text(encoding="utf-8"))
            return ExtractionResult.model_validate(data).model_copy(
                update={"llm_mode_used": "cached"}
            )
    return None


def _tool_schema() -> dict[str, Any]:
    field = {
        "type": "object",
        "properties": {
            "value": {"type": ["string", "number", "null"]},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "source_quote": {"type": ["string", "null"]},
        },
        "required": ["value", "confidence", "source_quote"],
    }
    return {
        "type": "object",
        "properties": {n: {**field, "description": _FIELD_HELP[n]} for n in FIELD_NAMES},
        "required": list(FIELD_NAMES),
    }


def _gazetteer_prompt() -> str:
    lines = [f"{s.id} = {s.name}" for s in STREETS]
    lines += [f"{j.id} = {j.name}" for j in JUNCTIONS]
    lines += [f"{lm.id} = {lm.name}" for lm in LANDMARKS]
    return "\n".join(lines)


SYSTEM_PROMPT = (
    "You extract structured fields from a utility-works permit (English, Hinglish or messy "
    "text). Call the tool once. For each field give the value, a confidence 0-1 and the exact "
    "source_quote copied verbatim from the permit. If a field is not stated, use value null, "
    "confidence 0 and source_quote null: never guess or default. Streets and references must "
    "be gazetteer IDs from this list (null if not listed). Never output coordinates. "
    "Distances in metres (convert mm).\n\nGazetteer:\n" + _gazetteer_prompt()
)


def _as_number(raw: Any) -> float | None:
    if isinstance(raw, bool):
        return None
    try:
        return float(raw)
    except TypeError, ValueError:
        return None


def validate_llm_fields(raw: dict[str, Any], text: str) -> ExtractionResult:
    """Deterministic guard on model output: bad quote / enum / number → null (then missing)."""
    haystack = _squash(text).casefold()
    street_ids = {s.id for s in STREETS}
    ref_ids = {j.id for j in JUNCTIONS} | {lm.id for lm in LANDMARKS}
    enums = {
        "work_type": {w.value for w in WorkType},
        "utility": {u.value for u in Utility},
        "side": set(SIDES),
        "street": street_ids,
        "from_ref": ref_ids,
        "to_ref": ref_ids,
    }
    fields: dict[str, ExtractedField] = {}
    for name in FIELD_NAMES:
        item = raw.get(name)
        if not isinstance(item, dict) or item.get("value") is None:
            continue
        quote = item.get("source_quote")
        if not isinstance(quote, str) or _squash(quote).casefold() not in haystack:
            continue  # unquoted / invented value
        value: str | float | None = item["value"]
        if name in _NUMERIC:
            number = _as_number(value)
            if number is None or number < 0:
                continue
            if number >= 20 and "mm" in quote.lower():  # model forgot to convert mm → m
                number /= 1000
            value = round(number, 4)
        elif name in _DATES:
            try:
                value = date.fromisoformat(str(value)).isoformat()
            except ValueError:
                continue
        else:
            value = str(value)
            if name in enums and value not in enums[name]:
                continue
        conf = _as_number(item.get("confidence")) or 0.0
        fields[name] = ExtractedField(
            value=value, confidence=min(max(conf, 0.0), 1.0), source_quote=quote
        )
    return build_result(fields, "live")


def _extract_live(text: str, settings: Settings, client: Any | None) -> ExtractionResult:
    if client is None:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key, timeout=LLM_TIMEOUT_S, max_retries=0
        )
    response = client.messages.create(
        model=settings.llm_model,
        max_tokens=1500,
        system=SYSTEM_PROMPT,
        tools=[
            {
                "name": TOOL_NAME,
                "description": "Record the fields extracted from the permit.",
                "input_schema": _tool_schema(),
            }
        ],
        tool_choice={"type": "tool", "name": TOOL_NAME},
        messages=[{"role": "user", "content": f"Permit text:\n{text}"}],
        timeout=LLM_TIMEOUT_S,
    )
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and isinstance(block.input, dict):
            return validate_llm_fields(block.input, text)
    raise ValueError("model returned no tool call")


def extract_permit(
    text: str, settings: Settings | None = None, client: Any | None = None
) -> ExtractionResult:
    """Extract fields. Only empty text raises; every other failure falls through the chain."""
    if not text or not text.strip():
        raise ExtractionUnavailable("Permit text is empty")
    settings = settings or get_settings()
    if settings.llm_mode == "live" and (settings.anthropic_api_key or client is not None):
        try:
            return _extract_live(text, settings, client)
        except Exception:
            log.warning("live permit extraction failed; using fixture/rules", exc_info=True)
    return load_fixture(text) or extract_with_rules(text)
