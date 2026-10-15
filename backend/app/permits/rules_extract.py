"""Deterministic, offline permit extractor (last fallback after live LLM and fixtures).

Every value found gets confidence 0.5 and an exact source quote copied from the text; anything
not found stays null and lands in `missing_fields`. It never produces coordinates.
"""

import itertools
import re
from datetime import date

from app.data.gazetteer import JUNCTIONS, LANDMARKS, STREETS
from app.permits.models import (
    ExtractedField,
    ExtractionResult,
    build_result,
)

CONFIDENCE = 0.5

NUM = r"(\d+(?:\.\d+)?)"
UNIT = r"(mm|m)\b"
APPROX = r"(?:(?:approx\.?|about|around|lagbhag|~)\s*)?"
DEPTH_KW = r"(?:deep|depth|gehra|gehri|gahra|gahri)"
WIDTH_KW = r"(?:wide|width|chaudai|chaudi|chauda)"
DIA_KW = r"(?:diameter|dia|vyas)"
LEAD = r"\s*(?:of|is|:|=|-)?\s*"

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}  # fmt: skip
MONTH_RE = (
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
    r"sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
ORD = r"(?:st|nd|rd|th)?"

WORK_TYPE_RULES: list[tuple[str, str]] = [
    ("HDD", r"\bhdd\b|horizontal directional|\bboring\b|\bbore\b"),
    ("TRENCH", r"\btrench\w*|\bkhudai\b|\bexcavat\w+"),
    ("PIPE_LAY", r"\bpipe[\s-]*lay(?:ing)?\b|\blaying of pipe\w*"),
    ("PIT", r"\bpit\b|\bchamber\b|\bmanhole\b"),
]

UTILITY_RULES: list[tuple[str, str]] = [
    ("GAS", r"\b(?:png|cng|gas)\b"),
    ("SEWER", r"\bsewer\w*|\bsewage\b|\bdrain\w*"),
    ("POWER", r"\d+(?:\.\d+)?\s*kv\b(?:\s+(?:cable|line))?"),
    ("TELECOM", r"\btelecom\b|\bfib(?:re|er)\b|\boptical\b|\bofc\b|\bbroadband\b|\bduct\b"),
    ("POWER", r"\bcable\w*|\belectric\w*|\bpower\b|\bdiscom\b"),
    ("WATER", r"\bwater\b|\bjal\b|\bpipeline\b|\bpipe\b"),
]

SIDE_WORDS = {
    "north": "NORTH", "uttar": "NORTH",
    "south": "SOUTH", "dakshin": "SOUTH",
    "east": "EAST", "purab": "EAST", "purv": "EAST",
    "west": "WEST", "paschim": "WEST",
}  # fmt: skip

_ABBREVIATIONS: dict[str, list[str]] = {
    "road": ["road", "rd"],
    "station": ["station", "stn"],
    "lane": ["lane", "ln"],
    "sector": ["sector", "sec"],
    "govt.": ["govt.", "govt", "government"],
}


def _norm(s: str) -> str:
    return re.sub(r"[.\s]+", " ", s.lower()).strip()


def _alias_regex(alias: str) -> str:
    tokens = [re.escape(t.rstrip(".")) + r"\.?" for t in alias.split()]
    return r"(?<![A-Za-z0-9])" + r"\s+".join(tokens) + r"(?![A-Za-z0-9])"


def _name_variants(name: str) -> set[str]:
    options = [_ABBREVIATIONS.get(tok.lower(), [tok]) for tok in name.split()]
    return {" ".join(combo) for combo in itertools.product(*options)}


def _street_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}
    for street in STREETS:
        for variant in _name_variants(street.name):
            aliases[_norm(variant)] = street.id
    return aliases


_LANDMARK_EXTRA: dict[str, list[str]] = {
    "LM-01": ["school", "government school", "govt school"],
    "LM-02": ["depot", "bus stand"],
    "LM-03": ["tank", "overhead tank"],
    "LM-04": ["hall", "community centre"],
    "LM-05": ["lake park", "park gate"],
}


def _landmark_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}
    for lm in LANDMARKS:
        for variant in _name_variants(lm.name):
            aliases[_norm(variant)] = lm.id
        for extra in _LANDMARK_EXTRA.get(lm.id, []):
            aliases[_norm(extra)] = lm.id
    return aliases


STREET_ALIASES = _street_aliases()
LANDMARK_ALIASES = _landmark_aliases()
_JUNCTION_IDS = {j.id for j in JUNCTIONS}
_STREET_IDS = {s.id for s in STREETS}
_LANDMARK_IDS = {lm.id for lm in LANDMARKS}


def _alias_pattern(aliases: dict[str, str]) -> re.Pattern[str]:
    ordered = sorted(aliases, key=len, reverse=True)
    return re.compile("|".join(_alias_regex(a) for a in ordered), re.IGNORECASE)


_STREET_RE = _alias_pattern(STREET_ALIASES)
_LANDMARK_RE = _alias_pattern(LANDMARK_ALIASES)
_STREET_ID_RE = re.compile(r"\bST[-\s]?0*(\d{1,2})\b", re.IGNORECASE)
_LANDMARK_ID_RE = re.compile(r"\bLM[-\s]?0*(\d{1,2})\b", re.IGNORECASE)
_JUNCTION_RE = re.compile(r"\b(?:JN[-\s]?0*(\d{1,2})|J[-\s]?0*(\d{1,2}))\b", re.IGNORECASE)


def _found(value: str | float, quote: str) -> ExtractedField:
    return ExtractedField(value=value, confidence=CONFIDENCE, source_quote=quote)


def _mentions(text: str, pattern: re.Pattern[str], lookup: dict[str, str]):
    for m in pattern.finditer(text):
        yield m.start(), m.end(), lookup[_norm(m.group(0))], m.group(0)


def _street(text: str) -> ExtractedField | None:
    hits = list(_mentions(text, _STREET_RE, STREET_ALIASES))
    for m in _STREET_ID_RE.finditer(text):
        sid = f"ST-{int(m.group(1)):02d}"
        if sid in _STREET_IDS:
            hits.append((m.start(), m.end(), sid, m.group(0)))
    if not hits:
        return None
    _, _, sid, quote = min(hits)
    return _found(sid, quote)


def _refs(text: str) -> list[tuple[int, int, str, str]]:
    """Junction / landmark mentions in text order, overlaps dropped."""
    hits: list[tuple[int, int, str, str]] = []
    for m in _JUNCTION_RE.finditer(text):
        jid = f"JN-{int(m.group(1) or m.group(2)):02d}"
        if jid in _JUNCTION_IDS:
            hits.append((m.start(), m.end(), jid, m.group(0)))
    for m in _LANDMARK_ID_RE.finditer(text):
        lid = f"LM-{int(m.group(1)):02d}"
        if lid in _LANDMARK_IDS:
            hits.append((m.start(), m.end(), lid, m.group(0)))
    hits += list(_mentions(text, _LANDMARK_RE, LANDMARK_ALIASES))
    hits.sort()
    kept: list[tuple[int, int, str, str]] = []
    for hit in hits:
        if kept and hit[0] < kept[-1][1]:
            continue
        kept.append(hit)
    return kept


def _from_to(text: str) -> tuple[ExtractedField | None, ExtractedField | None]:
    refs = _refs(text)
    if not refs:
        return None, None
    if len(refs) >= 2:
        return _found(refs[0][2], refs[0][3]), _found(refs[1][2], refs[1][3])
    start, end, rid, quote = refs[0]
    before = text[max(0, start - 10) : start].lower()
    after = text[end : end + 8].lower()
    if re.search(r"\b(?:to|till|until)\s*$", before) or re.match(r"\s*tak\b", after):
        return None, _found(rid, quote)
    return _found(rid, quote), None


def _keyword(text: str, rules: list[tuple[str, str]]) -> ExtractedField | None:
    for value, pattern in rules:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return _found(value, m.group(0))
    return None


def _side(text: str) -> ExtractedField | None:
    m = re.search(r"\b(" + "|".join(SIDE_WORDS) + r")\b(?:\s+side)?", text, re.IGNORECASE)
    if not m:
        return None
    return _found(SIDE_WORDS[m.group(1).lower()], m.group(0))


def _metres(value: str, unit: str) -> float:
    number = float(value)
    return round(number / 1000 if unit.lower() == "mm" else number, 4)


def _measure(text: str, keyword: str) -> tuple[float, str] | None:
    """Value (metres) next to a keyword, in either 'N m <kw>' or '<kw> N m' order."""
    before = re.search(
        APPROX + NUM + r"\s*" + UNIT + r"\s*(?:\w+\s+){0,2}?" + keyword + r"\b",
        text,
        re.IGNORECASE,
    )
    if before:
        return _metres(before.group(1), before.group(2)), before.group(0)
    after = re.search(
        r"\b" + keyword + r"\b\.?" + LEAD + APPROX + NUM + r"\s*" + UNIT, text, re.IGNORECASE
    )
    if after:
        return _metres(after.group(1), after.group(2)), after.group(0)
    return None


def _depth(text: str, work_type: str | None) -> tuple[ExtractedField | None, ExtractedField | None]:
    rng = re.search(
        APPROX + NUM + r"\s*(?:-|–|to)\s*" + NUM + r"\s*" + UNIT + r"\s*(?:\w+\s+){0,2}?"
        + DEPTH_KW + r"\b",
        text,
        re.IGNORECASE,
    )  # fmt: skip
    if rng:
        unit = rng.group(3)
        return (
            _found(_metres(rng.group(1), unit), rng.group(0)),
            _found(_metres(rng.group(2), unit), rng.group(0)),
        )
    found = _measure(text, DEPTH_KW)
    if not found:
        return None, None
    value, quote = found
    # Open-cut works start at the surface; an HDD bore top is not stated, so leave it missing.
    top = None if work_type == "HDD" else _found(0.0, quote)
    return top, _found(value, quote)


def _offset(text: str) -> ExtractedField | None:
    for pattern in (
        APPROX + NUM + r"\s*" + UNIT + r"\s*offset\b",
        r"\boffset\b" + LEAD + APPROX + NUM + r"\s*" + UNIT,
    ):
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return _found(_metres(m.group(1), m.group(2)), m.group(0))
    return None


def _diameter(text: str) -> ExtractedField | None:
    found = _measure(text, DIA_KW)
    if found:
        return _found(*found)
    other = r"\s*(?:\w+\s+){0,2}?(?:" + DEPTH_KW + "|" + WIDTH_KW + r")\b"
    for m in re.finditer(APPROX + NUM + r"\s*mm\b", text, re.IGNORECASE):
        if not re.match(other, text[m.end() :], re.IGNORECASE):  # not a depth / width
            return _found(_metres(m.group(1), "mm"), m.group(0))
    return None


def _dates(text: str) -> tuple[ExtractedField | None, ExtractedField | None]:
    def iso(year: int, month: str, day: str) -> str | None:
        try:
            return date(year, MONTHS[month[:3].lower()], int(day)).isoformat()
        except ValueError:
            return None

    rng = re.search(
        r"(\d{1,2})" + ORD + r"\s*[–\-]\s*(\d{1,2})" + ORD + r"\s+" + MONTH_RE
        + r"\.?,?\s*(\d{4})?",
        text,
        re.IGNORECASE,
    )  # fmt: skip
    if rng and rng.group(4):
        year = int(rng.group(4))
        start = iso(year, rng.group(3), rng.group(1))
        end = iso(year, rng.group(3), rng.group(2))
        quote = rng.group(0)
        return (_found(start, quote) if start else None, _found(end, quote) if end else None)

    singles = list(
        re.finditer(r"(\d{1,2})" + ORD + r"\s+" + MONTH_RE + r"\b\.?(?:,?\s*(\d{4}))?", text, re.I)
    )[:2]
    years = [int(m.group(3)) for m in singles if m.group(3)]
    if not singles or not years:
        return None, None  # a year is never guessed
    year_after = years[-1]
    fields: list[ExtractedField | None] = []
    for m in singles:
        year = int(m.group(3)) if m.group(3) else year_after
        value = iso(year, m.group(2), m.group(1))
        fields.append(_found(value, m.group(0)) if value else None)
    if len(fields) == 1:
        return fields[0], None
    return fields[0], fields[1]


def _agency(text: str) -> ExtractedField | None:
    m = re.match(r"\s*(.+?)\s*[—–\-:,]+\s*permit\b", text, re.IGNORECASE)
    if m and len(m.group(1)) <= 80:
        return _found(m.group(1), m.group(1))
    return None


def _permit_no(text: str) -> ExtractedField | None:
    m = re.search(
        r"\bpermit(?:\s+(?:no|number|num)\.?|\s*#)?\s*:?\s*([A-Za-z0-9][A-Za-z0-9/\-]*)",
        text,
        re.IGNORECASE,
    )
    if m and re.search(r"\d", m.group(1)):
        return _found(m.group(1), m.group(0))
    return None


def extract_with_rules(text: str) -> ExtractionResult:
    fields: dict[str, ExtractedField | None] = {}
    fields["agency"] = _agency(text)
    fields["permit_no"] = _permit_no(text)
    work_type = _keyword(text, WORK_TYPE_RULES)
    fields["work_type"] = work_type
    fields["utility"] = _keyword(text, UTILITY_RULES)
    fields["street"] = _street(text)
    fields["from_ref"], fields["to_ref"] = _from_to(text)
    fields["side"] = _side(text)
    fields["offset_m"] = _offset(text)
    fields["depth_from_m"], fields["depth_to_m"] = _depth(
        text, str(work_type.value) if work_type else None
    )
    width = _measure(text, WIDTH_KW)
    fields["width_m"] = _found(*width) if width else None
    fields["diameter_m"] = _diameter(text)
    fields["start_date"], fields["end_date"] = _dates(text)
    return build_result({k: v for k, v in fields.items() if v is not None}, "rules")
