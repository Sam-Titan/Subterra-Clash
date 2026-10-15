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
