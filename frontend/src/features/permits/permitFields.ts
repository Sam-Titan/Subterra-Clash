// Pure helpers for the permit intake page: field metadata, confidence tiers,
// source-quote spans and the "assumed value" check. No React here.

import type {
	ExtractedField,
	FieldValue,
	PermitDraft,
	PermitFieldName,
} from "@/api/types";

export type FieldKind = "text" | "enum" | "street" | "ref" | "number" | "date";

export interface FieldMeta {
	label: string;
	kind: FieldKind;
	/** Shown after numeric labels, e.g. "Depth from (m)". */
	unit?: "m";
}

export const FIELD_META: Record<PermitFieldName, FieldMeta> = {
	agency: { label: "Agency", kind: "text" },
	permit_no: { label: "Permit no.", kind: "text" },
	work_type: { label: "Work type", kind: "enum" },
	utility: { label: "Utility", kind: "enum" },
	street: { label: "Street", kind: "street" },
	from_ref: { label: "From", kind: "ref" },
	to_ref: { label: "To", kind: "ref" },
	side: { label: "Side", kind: "enum" },
	offset_m: { label: "Offset from centreline", kind: "number", unit: "m" },
	depth_from_m: { label: "Depth from", kind: "number", unit: "m" },
	depth_to_m: { label: "Depth to", kind: "number", unit: "m" },
	width_m: { label: "Width", kind: "number", unit: "m" },
	diameter_m: { label: "Diameter", kind: "number", unit: "m" },
	start_date: { label: "Start", kind: "date" },
	end_date: { label: "End", kind: "date" },
};

export const FIELD_GROUPS: { title: string; fields: PermitFieldName[] }[] = [
	{ title: "Permit", fields: ["agency", "permit_no", "work_type", "utility"] },
	{
		title: "Location",
		fields: ["street", "from_ref", "to_ref", "side", "offset_m"],
	},
	{
		title: "Geometry",
		fields: ["depth_from_m", "depth_to_m", "width_m", "diameter_m"],
	},
	{ title: "Schedule", fields: ["start_date", "end_date"] },
];

/** The quote PATCH writes for reviewer edits (API_CONTRACT, PATCH). */
export const EDITED_QUOTE = "edited by reviewer";

export type ConfidenceTier = "high" | "medium" | "low" | "missing" | "edited";

export function confidenceTier(field: ExtractedField): ConfidenceTier {
	if (field.value === null) return "missing";
	if (field.source_quote === EDITED_QUOTE) return "edited";
	if (field.confidence >= 0.85) return "high";
	if (field.confidence >= 0.6) return "medium";
	return "low";
}

export function fieldOf(
	draft: PermitDraft,
	name: PermitFieldName,
): ExtractedField {
	return (
		draft.fields[name] ?? { value: null, confidence: 0, source_quote: null }
	);
}

// --- Assumed values -------------------------------------------------------

const MONTHS = [
	"jan",
	"feb",
	"mar",
	"apr",
	"may",
	"jun",
	"jul",
	"aug",
	"sep",
	"oct",
	"nov",
	"dec",
];

function numbersIn(text: string): number[] {
	return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) =>
		Number(m[0].replace(",", ".")),
	);
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * True when a number or date was not stated literally in its quote, e.g.
 * depth_from 0.0 from "approx 1.2 m deep". Numbers may be quoted in m, cm or
 * mm ("300 mm" → 0.3). Dates need their day and month in the quote (the year
 * may be implied). Text, enum and reference fields are interpretations of
 * their quote by design and are never flagged. Edited values are not assumed.
 */
export function isAssumed(name: PermitFieldName, field: ExtractedField) {
	const { value, source_quote: quote } = field;
	if (value === null || quote === null || quote === EDITED_QUOTE) return false;
	const kind = FIELD_META[name].kind;

	if (kind === "number" && typeof value === "number") {
		return !numbersIn(quote).some(
			(n) => close(n, value) || close(n / 100, value) || close(n / 1000, value),
		);
	}
	if (kind === "date" && typeof value === "string") {
		const [, month, day] = value.split("-").map(Number);
		if (!month || !day) return true;
		const lower = quote.toLowerCase();
		const hasDay = numbersIn(quote).some((n) => n === day);
		const hasMonth =
			lower.includes(MONTHS[month - 1]) ||
			new RegExp(`\\b0?${month}\\b`).test(lower);
		return !(hasDay && hasMonth);
	}
	return false;
}

/**
 * Geocode notes that explain a field, e.g. "offset_m missing → using street
 * side edge (3 m from kerb)". Matched by the field name the notes start with.
 */
export function notesFor(draft: PermitDraft, name: PermitFieldName): string[] {
	return draft.geocode.notes.filter(
		(n) => n.startsWith(`${name} `) || n.startsWith(`${name}:`),
	);
}

// --- Source-quote spans ---------------------------------------------------

export interface QuoteSpan {
	field: PermitFieldName;
	start: number;
	end: number;
}

export interface TextSegment {
	text: string;
	start: number;
	/** Fields whose quote covers this segment (may be several). */
	fields: PermitFieldName[];
}

/**
 * First occurrence of each field's quote in the source text. Quotes that are
 * not found verbatim are returned separately and never highlighted elsewhere.
 */
export function findQuoteSpans(
	text: string,
	draft: PermitDraft,
	names: readonly PermitFieldName[],
): { spans: QuoteSpan[]; notFound: PermitFieldName[] } {
	const spans: QuoteSpan[] = [];
	const notFound: PermitFieldName[] = [];
	for (const name of names) {
		const quote = fieldOf(draft, name).source_quote;
		if (!quote || quote === EDITED_QUOTE) continue;
		const start = text.indexOf(quote);
		if (start < 0) notFound.push(name);
		else spans.push({ field: name, start, end: start + quote.length });
	}
	return { spans, notFound };
}

/**
 * Splits the text at every span boundary so overlapping and repeated quotes
 * (two fields quoting the same words) become flat, non-nested segments.
 */
export function segmentText(text: string, spans: QuoteSpan[]): TextSegment[] {
	const cuts = new Set<number>([0, text.length]);
	for (const s of spans) {
		cuts.add(s.start);
		cuts.add(s.end);
	}
	const points = [...cuts].sort((a, b) => a - b);
	const segments: TextSegment[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i];
		const b = points[i + 1];
		if (b <= a) continue;
		segments.push({
			text: text.slice(a, b),
			start: a,
			fields: spans
				.filter((s) => s.start <= a && s.end >= b)
				.map((s) => s.field),
		});
	}
	return segments;
}

// --- Edits ----------------------------------------------------------------

/** What an input holds while editing; converted to an API value on save. */
export type DraftInput = string;

export function toInput(value: FieldValue): DraftInput {
	return value === null ? "" : String(value);
}

/**
 * Input text → PATCH value. Empty = clear (null). Numbers that do not parse
 * are sent as typed so the server's INVALID_FIELD_VALUE message is shown.
 */
export function fromInput(
	name: PermitFieldName,
	input: DraftInput,
): FieldValue {
	const trimmed = input.trim();
	if (trimmed === "") return null;
	if (FIELD_META[name].kind === "number") {
		const n = Number(trimmed);
		return Number.isFinite(n) ? n : trimmed;
	}
	return trimmed;
}
