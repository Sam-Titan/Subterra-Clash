// Display formatting. Missing values are shown as missing, never as 0.

import type { Utility } from "@/api/types";

export const MISSING = "unknown";

export function formatMetres(
	value: number | null | undefined,
	digits = 2,
): string {
	if (value === null || value === undefined) return MISSING;
	return `${value.toFixed(digits)} m`;
}

/** Surface-to-surface gap; negative means the bodies overlap. */
export function formatGap(value: number | null | undefined): string {
	if (value === null || value === undefined) return MISSING;
	if (value < 0) return `−${Math.abs(value).toFixed(2)} m (overlap)`;
	return `${value.toFixed(2)} m`;
}

/** "0.18 m measured / 0.60 m required" */
export function formatClearance(
	measured: number | null | undefined,
	required: number | null | undefined,
): string {
	return `${formatGap(measured)} measured / ${formatMetres(required)} required`;
}

export function formatUncertainty(value: number | null | undefined): string {
	if (value === null || value === undefined) return MISSING;
	return `±${value.toFixed(2)} m`;
}

const dateFormat = new Intl.DateTimeFormat("en-IN", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

/** ISO YYYY-MM-DD → "3 Nov 2026" (parsed as a calendar date, no timezone shift). */
export function formatDate(iso: string | null | undefined): string {
	if (!iso) return MISSING;
	const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
	if (!y || !m || !d) return iso;
	return dateFormat.format(new Date(y, m - 1, d));
}

export function formatDateRange(
	start: string | null | undefined,
	end: string | null | undefined,
): string {
	return `${formatDate(start)} – ${formatDate(end)}`;
}

/** 0.67 → "67%" */
export function formatPercent(
	value: number | null | undefined,
	digits = 0,
): string {
	if (value === null || value === undefined) return MISSING;
	return `${(value * 100).toFixed(digits)}%`;
}

export function formatScore(score: number): string {
	return String(Math.round(score));
}

/** "NEEDS_DATA" → "Needs data" */
export function humanizeEnum(value: string): string {
	const text = value.toLowerCase().replaceAll("_", " ");
	return text.charAt(0).toUpperCase() + text.slice(1);
}

const UTILITY_LABELS: Record<Utility, string> = {
	WATER: "Water",
	SEWER: "Sewer",
	POWER: "Power",
	TELECOM: "Telecom",
	GAS: "Gas",
};

export function utilityLabel(utility: Utility): string {
	return UTILITY_LABELS[utility];
}
