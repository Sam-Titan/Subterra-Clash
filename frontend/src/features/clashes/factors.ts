// Severity breakdown (SPEC §8.5). The API sends each factor as a raw 0–1 term;
// the score is 100 × the weighted sum, rounded half-up. Segments here are the
// weighted contributions in points, rounded so they add up to the displayed
// score exactly.

import type { Severity, SeverityFactors } from "@/api/types";

export type FactorKey = keyof SeverityFactors;

export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
	hazard: 0.4,
	breach: 0.3,
	urgency: 0.15,
	confidence: 0.15,
};

export const FACTOR_ORDER: readonly FactorKey[] = [
	"hazard",
	"breach",
	"urgency",
	"confidence",
];

export const FACTOR_LABELS: Record<FactorKey, string> = {
	hazard: "Hazard",
	breach: "Breach",
	urgency: "Urgency",
	confidence: "Confidence",
};

export interface FactorSegment {
	key: FactorKey;
	/** Raw 0–1 term from the API. */
	raw: number;
	weight: number;
	/** Integer points; all segments sum to `severity.score`. */
	points: number;
}

/** Largest-remainder rounding of the weighted contributions to `score`. */
export function factorSegments(severity: Severity): FactorSegment[] {
	const exact = FACTOR_ORDER.map(
		(key) => 100 * FACTOR_WEIGHTS[key] * severity.factors[key],
	);
	const points = exact.map(Math.floor);
	let diff = severity.score - points.reduce((a, b) => a + b, 0);

	const byRemainder = exact
		.map((value, i) => ({ i, rem: value - Math.floor(value) }))
		.sort((a, b) => b.rem - a.rem);

	for (let n = 0; diff > 0 && n < 100; n++) {
		points[byRemainder[n % byRemainder.length].i] += 1;
		diff -= 1;
	}
	for (let n = byRemainder.length - 1; diff < 0 && n >= 0; n--) {
		const i = byRemainder[n].i;
		if (points[i] > 0) {
			points[i] -= 1;
			diff += 1;
		}
	}

	return FACTOR_ORDER.map((key, i) => ({
		key,
		raw: severity.factors[key],
		weight: FACTOR_WEIGHTS[key],
		points: points[i],
	}));
}
