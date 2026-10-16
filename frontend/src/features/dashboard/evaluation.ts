// Display helpers for the ours-vs-baseline table. They only read what the API
// sent (SPEC §8.7 / API_CONTRACT `cases[]`); nothing is recomputed here.
// Outcome strings the UI does not know are shown raw, never guessed at.

import type { Certainty, EvaluationCase } from "@/api/types";

const SPATIAL_OUTCOMES = new Set(["INTERSECTION", "CLEARANCE"]);
const SCHEDULE_OUTCOMES = new Set(["SCHEDULE_OVERLAP", "DIG_ONCE"]);
const KNOWN_OUTCOMES = new Set([
	...SPATIAL_OUTCOMES,
	...SCHEDULE_OUTCOMES,
	"NO_CLASH",
]);

export type VerdictStatus = "pass" | "fail" | "na" | "unknown";

export interface Verdict {
	status: VerdictStatus;
	label: string;
}

/** "CLEARANCE · NEEDS_DATA"; "NO_CLASH" alone when there is no certainty. */
export function formatOutcome(
	outcome: string,
	certainty: Certainty | null,
): string {
	return certainty ? `${outcome} · ${certainty}` : outcome;
}

/** Ours matches the planted expectation: same outcome and same certainty. */
export function caseVerdict(c: EvaluationCase): Verdict {
	if (!KNOWN_OUTCOMES.has(c.expected) || !KNOWN_OUTCOMES.has(c.ours))
		return {
			status: "unknown",
			label: KNOWN_OUTCOMES.has(c.ours) ? c.expected : c.ours,
		};
	const pass =
		c.ours === c.expected && c.ours_certainty === c.expected_certainty;
	return { status: pass ? "pass" : "fail", label: pass ? "Pass" : "Differs" };
}

/**
 * The naive 2D overlay (SPEC §8.6) against the expectation: a flagged
 * NO_CLASH case is a false alarm, an unflagged spatial clash a miss. It has
 * no schedule check, so schedule cases are "n/a".
 */
export function baselineVerdict(c: EvaluationCase): Verdict {
	if (SCHEDULE_OUTCOMES.has(c.expected))
		return { status: "na", label: "n/a: no schedule check" };
	if (c.baseline !== "FLAGGED" && c.baseline !== "NOT_FLAGGED")
		return { status: "unknown", label: c.baseline };
	const flagged = c.baseline === "FLAGGED";
	if (c.expected === "NO_CLASH")
		return flagged
			? { status: "fail", label: "Flagged · false alarm" }
			: { status: "pass", label: "Not flagged · correct" };
	if (SPATIAL_OUTCOMES.has(c.expected))
		return flagged
			? { status: "pass", label: "Flagged · found" }
			: { status: "fail", label: "Not flagged · missed" };
	return { status: "unknown", label: c.baseline };
}
