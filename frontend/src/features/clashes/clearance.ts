import type { Clash } from "@/api/types";

/** "−0.60 / 0.60 m", "? / 0.60 m", "5 d overlap", "45 d apart". */
export function compactClearance(clash: Clash): string {
	if (clash.schedule) {
		return clash.schedule.overlap_days > 0
			? `${clash.schedule.overlap_days} d overlap`
			: `${clash.schedule.gap_days} d apart`;
	}
	const gap =
		clash.measured_gap_m === null
			? "?"
			: clash.measured_gap_m < 0
				? `−${Math.abs(clash.measured_gap_m).toFixed(2)}`
				: clash.measured_gap_m.toFixed(2);
	const required =
		clash.required_clearance_m === null
			? "?"
			: clash.required_clearance_m.toFixed(2);
	return `${gap} / ${required} m`;
}
