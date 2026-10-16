// Pure schedule maths for the mini Gantt and the date filter. Dates are
// calendar days: "YYYY-MM-DD" → whole UTC day numbers, so the browser's
// timezone never shifts a work by a day. End dates are inclusive.

import type { Clash, Work } from "@/api/types";

const MS_PER_DAY = 86_400_000;
/** Days of margin either side of the works' date range (axis + scrubber). */
export const RANGE_MARGIN_DAYS = 3;

/** "2026-11-03" → UTC day number; null if missing or malformed. */
export function isoToDay(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	if (!match) return null;
	const [, y, m, d] = match.map(Number);
	const ms = Date.UTC(y, m - 1, d);
	return Number.isNaN(ms) ? null : Math.round(ms / MS_PER_DAY);
}

export function dayToIso(day: number): string {
	return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export interface WorkSpan {
	work: Work;
	/** null when a date is missing: the work is never hidden by the filter. */
	start: number | null;
	end: number | null;
}

export function workSpan(work: Work): WorkSpan {
	return {
		work,
		start: isoToDay(work.start_date),
		end: isoToDay(work.end_date),
	};
}

/**
 * Active on `day`, start and end inclusive. A work with an unknown date is
 * treated as active: missing data never hides anything.
 */
export function isSpanActive(span: WorkSpan, day: number): boolean {
	if (span.start === null || span.end === null) return true;
	return span.start <= day && day <= span.end;
}

export interface DayRange {
	min: number;
	max: number;
}

/** Works' first start to last end, plus the margin; null with no dated work. */
export function timelineRange(spans: WorkSpan[]): DayRange | null {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const s of spans) {
		if (s.start !== null) min = Math.min(min, s.start);
		if (s.end !== null) max = Math.max(max, s.end);
	}
	if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
	return { min: min - RANGE_MARGIN_DAYS, max: max + RANGE_MARGIN_DAYS };
}

export function clampDay(day: number, range: DayRange): number {
	return Math.min(range.max, Math.max(range.min, Math.round(day)));
}

/** Rows top to bottom: by start date (unknown last), then id. */
export function sortSpans(spans: WorkSpan[]): WorkSpan[] {
	return [...spans].sort((a, b) => {
		const sa = a.start ?? Number.POSITIVE_INFINITY;
		const sb = b.start ?? Number.POSITIVE_INFINITY;
		return sa === sb ? a.work.id.localeCompare(b.work.id) : sa - sb;
	});
}

export type ScheduleLinkKind = "SCHEDULE_OVERLAP" | "DIG_ONCE";

export interface ScheduleLink {
	clash: Clash;
	kind: ScheduleLinkKind;
	/** Earlier-starting work first. */
	first: WorkSpan;
	second: WorkSpan;
	/** Day span the link covers on the axis (overlap window or the gap). */
	from: number;
	to: number;
	/** From the API (`schedule.overlap_days` / `gap_days`), never recomputed. */
	days: number;
}

/**
 * One link per schedule clash whose two works are both on the strip and dated.
 * Positions come from the work dates; the day count shown comes from the API.
 */
export function scheduleLinks(
	clashes: Clash[],
	spans: Map<string, WorkSpan>,
): ScheduleLink[] {
	const links: ScheduleLink[] = [];
	for (const clash of clashes) {
		if (clash.kind !== "SCHEDULE_OVERLAP" && clash.kind !== "DIG_ONCE")
			continue;
		if (!clash.schedule || clash.work_ids.length < 2) continue;
		const pair = clash.work_ids.slice(0, 2).map((id) => spans.get(id));
		const [a, b] = pair;
		if (!a || !b) continue;
		if (
			a.start === null ||
			a.end === null ||
			b.start === null ||
			b.end === null
		)
			continue;
		const [first, second] =
			a.start < b.start || (a.start === b.start && a.work.id < b.work.id)
				? [a, b]
				: [b, a];
		const fs = first.start as number;
		const fe = first.end as number;
		const ss = second.start as number;
		const se = second.end as number;
		if (clash.kind === "SCHEDULE_OVERLAP") {
			links.push({
				clash,
				kind: clash.kind,
				first,
				second,
				from: Math.max(fs, ss),
				// Inclusive end day: the window reaches the end of that day.
				to: Math.min(fe, se) + 1,
				days: clash.schedule.overlap_days,
			});
		} else {
			links.push({
				clash,
				kind: clash.kind,
				first,
				second,
				from: fe + 1,
				to: ss,
				days: clash.schedule.gap_days,
			});
		}
	}
	return links;
}

/**
 * Whether the date filter keeps a clash in the 3D scene: at least one of its
 * works is active that day. Clashes without works are never hidden.
 */
export function clashActiveOn(
	clash: Clash,
	spans: Map<string, WorkSpan>,
	day: number,
): boolean {
	if (clash.work_ids.length === 0) return true;
	return clash.work_ids.some((id) => {
		const span = spans.get(id);
		return span ? isSpanActive(span, day) : true;
	});
}
