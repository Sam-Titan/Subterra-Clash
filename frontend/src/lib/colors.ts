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
