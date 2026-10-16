// Single source of colours (SPEC §10). Utilities follow the APWA uniform colour
// code; do not use colour literals anywhere else.

import type {
	Certainty,
	ReviewStatus,
	SeverityBand,
	Utility,
} from "@/api/types";

export const UTILITY_COLORS: Record<Utility, string> = {
	POWER: "#E5484D",
	GAS: "#F5D90A",
	TELECOM: "#F76B15",
	WATER: "#0090FF",
	SEWER: "#30A46C",
};

/** Proposed works / excavation (APWA pink = temporary survey marking). */
export const WORK_COLOR = "#D6409F";

// Certainty markers are deliberately neutral so they never read as POWER red
// or GAS yellow. The style carries the meaning: LIKELY = solid + pulse,
// POSSIBLE = dashed ring, NEEDS_DATA = grey with a "?" glyph.
export type CertaintyMarkerStyle = "solid-pulse" | "dashed-ring" | "question";

export const CERTAINTY_COLORS: Record<Certainty, string> = {
	LIKELY: "#FFFFFF",
	POSSIBLE: "#C9CBD3",
	NEEDS_DATA: "#7C7F8A",
};

export const CERTAINTY_STYLE: Record<Certainty, CertaintyMarkerStyle> = {
	LIKELY: "solid-pulse",
	POSSIBLE: "dashed-ring",
	NEEDS_DATA: "question",
};

export const SEVERITY_BAND_COLORS: Record<SeverityBand, string> = {
	CRITICAL: "#FF5F7E",
	HIGH: "#FF9F5A",
	MEDIUM: "#A78BFA",
	LOW: "#5EB1EF",
	INFO: "#8B8D98",
};

export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
	OPEN: "#EDEEF0",
	ACKNOWLEDGED: "#5EB1EF",
	ESCALATED: "#FF9F5A",
	DISMISSED: "#6F6E77",
};

export const SCENE_COLORS = {
	background: "#09090B",
	ground: "#1C1D22",
	streetOutline: "#5A5C66",
	label: "#D4D4D8",
	/** Thin line from a clash marker up to the road surface. */
	leader: "#8B8D98",
	keyLight: "#FFFFFF",
	fillLight: "#B8C4FF",
} as const;

/**
 * Severity factor bar segments (SPEC §8.5). A neutral ramp on purpose, so the
 * bar never reads as a utility colour; the legend names each segment.
 */
export const FACTOR_COLORS = {
	hazard: "#E4E4E7",
	breach: "#A1A1AA",
	urgency: "#71717A",
	confidence: "#52525B",
} as const;

/**
 * Permit intake (SPEC §10.4). Confidence chips are a neutral ramp so they never
 * read as utility colours; missing and assumed values use dashed outlines.
 */
export const CONFIDENCE_COLORS = {
	high: "#E4E4E7",
	medium: "#A1A1AA",
	low: "#71717A",
	edited: "#5EB1EF",
} as const;

export const INTAKE_COLORS = {
	/** Faint underline on every quoted span of the source text. */
	quoteUnderline: "#52525B",
	/** Background of the quote(s) for the hovered / focused field. */
	quoteActive: "#D6409F55",
	/** Visible warning for PARTIAL geocodes and assumed values. */
	warning: "#FF9F5A",
	previewGround: "#111114",
	previewStreet: "#27272A",
	previewCentreline: "#3F3F46",
	previewLabel: "#A1A1AA",
	previewNode: "#71717A",
	/** Junction / landmark named by the draft's from_ref / to_ref. */
	previewRef: "#FFFFFF",
	/** Ring around clash markers added by the latest permit commit. */
	newClashRing: "#D6409F",
} as const;

/** Section plane (3D) and cross-section drawing (SVG). Neutral on purpose. */
export const SECTION_COLORS = {
	plane: "#A1A1AA",
	handle: "#E4E4E7",
	grid: "#27272A",
	gridLabel: "#71717A",
	surface: "#A1A1AA",
	kerb: "#5A5C66",
	/** Dimension line and its label. */
	dimension: "#FFFFFF",
	/** Required-clearance envelope around the selected work. */
	envelope: "#C9CBD3",
	labelBg: "#09090B",
} as const;

/**
 * Dashboard bars (SPEC §10.5): one series per chart, each bar coloured by its
 * entity, so these are the utility and certainty colours above; text stays zinc.
 */
export const CHART_COLORS = {
	grid: "#27272A",
	axisLabel: "#A1A1AA",
	valueLabel: "#E4E4E7",
	cursor: "#FFFFFF0F",
} as const;

/** Schedule strip (mini Gantt). Bars use WORK_COLOR; the rest stays neutral. */
export const SCHEDULE_COLORS = {
	grid: "#27272A",
	axisLabel: "#71717A",
	rowLabel: "#A1A1AA",
	/** Shaded window where two nearby works overlap in time. */
	overlap: "#FFFFFF",
	/** Dashed link across the gap between two dig-once works. */
	digOnce: "#8B8D98",
	/** Outline of the link whose clash is selected. */
	selected: "#FFFFFF",
	/** Demo "today" line. */
	today: "#5EB1EF",
	scrubber: "#F5F5F5",
	scrubberLabelBg: "#09090B",
} as const;

/** Ours-vs-baseline verdicts; always shown with an icon and a word too. */
export const VERDICT_COLORS = {
	pass: "#E4E4E7",
	fail: "#FF5F7E",
	na: "#71717A",
	unknown: "#FF9F5A",
} as const;
