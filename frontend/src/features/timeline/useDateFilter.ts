import { useMemo } from "react";
import type { Clash, Scene, Work } from "@/api/types";
import { useAppStore } from "@/store/useAppStore";
import {
	clashActiveOn,
	isoToDay,
	isSpanActive,
	type WorkSpan,
	workSpan,
} from "./scheduleGeometry";

export interface DateFilteredScene {
	/** The scrubber's day, or null when no date filter is set. */
	day: number | null;
	/** Works drawn in 3D: those active on the day (all when unfiltered). */
	works: Work[];
	/** Clashes given to the 3D markers; the selected clash is always kept. */
	clashes: Clash[];
	/**
	 * Clashes the certainty filter would show but the date hides in 3D.
	 * The conflict list and the queue are never date-filtered.
	 */
	hiddenCount: number;
}

/** Applies the schedule scrubber (store `dateFilter`) to the 3D scene only. */
export function useDateFilteredScene(
	scene: Scene | undefined,
	clashes: Clash[],
): DateFilteredScene {
	const dateFilter = useAppStore((s) => s.dateFilter);
	const certaintyFilter = useAppStore((s) => s.certaintyFilter);
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const day = isoToDay(dateFilter);
	const allWorks = scene?.works;

	const spans = useMemo(
		() =>
			new Map<string, WorkSpan>(
				(allWorks ?? []).map((w) => [w.id, workSpan(w)]),
			),
		[allWorks],
	);

	const works = useMemo(() => {
		if (!allWorks) return [];
		if (day === null) return allWorks;
		return allWorks.filter((w) => {
			const span = spans.get(w.id);
			return span ? isSpanActive(span, day) : true;
		});
	}, [allWorks, spans, day]);

	return useMemo(() => {
		if (day === null) return { day, works, clashes, hiddenCount: 0 };
		const kept: Clash[] = [];
		let hiddenCount = 0;
		for (const c of clashes) {
			if (c.id === selectedClashId || clashActiveOn(c, spans, day)) {
				kept.push(c);
			} else if (certaintyFilter.includes(c.certainty)) {
				hiddenCount += 1;
			}
		}
		return { day, works, clashes: kept, hiddenCount };
	}, [day, works, clashes, spans, selectedClashId, certaintyFilter]);
}
