import { CalendarRange, X } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useMemo, useRef } from "react";
import { useHealth } from "@/api/hooks";
import type { Clash, Scene, Work } from "@/api/types";
import { DockBar, type DockChrome } from "@/components/BottomDock";
import { ErrorBlock, LoadingBlock } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useElementSize } from "@/features/section/useElementSize";
import { SCHEDULE_COLORS, WORK_COLOR } from "@/lib/colors";
import { formatDate, humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import {
	clampDay,
	type DayRange,
	dayToIso,
	isoToDay,
	isSpanActive,
	type ScheduleLink,
	scheduleLinks,
	sortSpans,
	timelineRange,
	type WorkSpan,
	workSpan,
} from "./scheduleGeometry";
import { useDateFilteredScene } from "./useDateFilter";

const LABEL_W = 220;
const RIGHT_PAD = 16;
const AXIS_H = 22;
const ROW_H = 16;
const BAR_INSET = 3;
/** Link buttons are at least this big, wider than the drawn lines. */
const MIN_HIT_PX = 16;
const HIT_PAD_PX = 5;
const TICK_EVERY_DAYS = 7;

const shortDayFormat = new Intl.DateTimeFormat("en-IN", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
});
function shortDay(day: number): string {
	return shortDayFormat.format(new Date(day * 86_400_000));
}

function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

function workLine(w: Work): string {
	return `${w.id} · ${w.title} · permit ${w.source_permit.permit_no}`;
}

function linkLabel(link: ScheduleLink): string {
	return link.kind === "SCHEDULE_OVERLAP"
		? `${plural(link.days, "day")} overlap`
		: `${plural(link.days, "day")} apart · dig once`;
}

interface Layout {
	plotW: number;
	range: DayRange;
	/** Left edge of a day (px within the plot). */
	x: (day: number) => number;
	rowTop: (row: number) => number;
	rowMid: (row: number) => number;
	/** Plot px → day (clamped to the range). */
	dayAt: (px: number) => number;
}

function makeLayout(width: number, range: DayRange): Layout {
	const plotW = Math.max(1, width - LABEL_W - RIGHT_PAD);
	// The range is inclusive of its last day, so the axis ends at max + 1.
	const span = range.max + 1 - range.min;
	return {
		plotW,
		range,
		x: (day) => ((day - range.min) / span) * plotW,
		rowTop: (row) => AXIS_H + row * ROW_H,
		rowMid: (row) => AXIS_H + row * ROW_H + ROW_H / 2,
		dayAt: (px) => clampDay(Math.floor(range.min + (px / plotW) * span), range),
	};
}

/**
 * Workspace bottom-dock tab: a mini Gantt of every work, schedule overlaps and
 * dig-once gaps linked between their rows (click a link to select its clash),
 * the demo "today" line, and a date scrubber on the axis that filters the 3D
 * scene (works + markers) to what is active that day. Day counts on links are
 * the API's `overlap_days` / `gap_days`.
 */
export function ScheduleStrip({
	scene,
	sceneError,
	onRetry,
	clashes,
	chrome,
}: {
	scene: Scene | undefined;
	sceneError: unknown;
	onRetry: () => void;
	clashes: Clash[];
	chrome: DockChrome;
}) {
	const dateFilter = useAppStore((s) => s.dateFilter);
	const setDateFilter = useAppStore((s) => s.setDateFilter);
	const { day, hiddenCount } = useDateFilteredScene(scene, clashes);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<DockBar chrome={chrome}>
				{day !== null ? (
					<>
						<Badge
							variant="outline"
							className="shrink-0 gap-1.5 border-zinc-600 bg-zinc-900 text-zinc-100"
						>
							<CalendarRange className="size-3" aria-hidden />
							Active on {formatDate(dateFilter)}
						</Badge>
						<span
							className="min-w-0 truncate text-xs text-zinc-400"
							aria-live="polite"
						>
							{plural(hiddenCount, "clash", "clashes")} hidden in 3D by date
						</span>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 shrink-0 px-2 text-xs text-zinc-300"
							onClick={() => setDateFilter(null)}
						>
							<X className="size-3.5" aria-hidden />
							Clear
						</Button>
					</>
				) : (
					<span className="hidden min-w-0 truncate text-xs text-zinc-500 md:inline">
						Drag along the date axis to show only works active that day in 3D
					</span>
				)}
				<Legend />
			</DockBar>

			{!chrome.collapsed && (
				<div className="min-h-0 flex-1 overflow-y-auto">
					{scene ? (
						<Gantt scene={scene} clashes={clashes} />
					) : sceneError ? (
						<div className="p-3">
							<ErrorBlock
								title="Could not load the works"
								error={sceneError}
								onRetry={onRetry}
							/>
						</div>
					) : (
						<div className="p-3">
							<LoadingBlock label="Loading works…" />
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function Legend() {
	return (
		<div className="ml-auto hidden shrink-0 items-center gap-3 text-[11px] text-zinc-500 xl:flex">
			<span className="flex items-center gap-1.5">
				<span
					className="inline-block h-2.5 w-3 rounded-sm border"
					style={{
						borderColor: SCHEDULE_COLORS.overlap,
						backgroundColor: `${SCHEDULE_COLORS.overlap}26`,
					}}
					aria-hidden
				/>
				Overlap
			</span>
			<span className="flex items-center gap-1.5">
				<svg width="14" height="4" aria-hidden>
					<line
						x1="0"
						y1="2"
						x2="14"
						y2="2"
						stroke={SCHEDULE_COLORS.digOnce}
						strokeWidth="2"
						strokeDasharray="3 2"
					/>
				</svg>
				Dig once
			</span>
			<span className="flex items-center gap-1.5">
				<span
					className="inline-block h-3 w-0.5"
					style={{ backgroundColor: SCHEDULE_COLORS.today }}
					aria-hidden
				/>
				Today
			</span>
		</div>
	);
}

function Gantt({ scene, clashes }: { scene: Scene; clashes: Clash[] }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const { width } = useElementSize(wrapRef);
	const health = useHealth();
	const dateFilter = useAppStore((s) => s.dateFilter);
	const setDateFilter = useAppStore((s) => s.setDateFilter);
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const selectClash = useAppStore((s) => s.selectClash);
	const fresh = useAppStore((s) => s.intakeResult?.workId ?? null);

	const rows = useMemo(() => sortSpans(scene.works.map(workSpan)), [scene]);
	const spans = useMemo(
		() => new Map<string, WorkSpan>(rows.map((r) => [r.work.id, r])),
		[rows],
	);
	const rowOf = useMemo(
		() => new Map<string, number>(rows.map((r, i) => [r.work.id, i])),
		[rows],
	);
	const links = useMemo(() => scheduleLinks(clashes, spans), [clashes, spans]);
	const range = useMemo(() => timelineRange(rows), [rows]);
	const layout = useMemo(
		() => (range && width > 0 ? makeLayout(width, range) : null),
		[range, width],
	);

	const day = isoToDay(dateFilter);
	const today = isoToDay(health.data?.demo_date);
	const height = AXIS_H + rows.length * ROW_H + 4;

	if (rows.length === 0)
		return <p className="p-3 text-sm text-zinc-500">No works in the plan.</p>;

	if (!range)
		return (
			<p className="p-3 text-sm text-zinc-500">
				No work has both dates, so there is nothing to place on a timeline.
			</p>
		);

	const setDay = (d: number) => setDateFilter(dayToIso(clampDay(d, range)));
	const startDay =
		today !== null && today >= range.min && today <= range.max
			? today
			: range.min;

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		const step = e.shiftKey ? TICK_EVERY_DAYS : 1;
		const current = day ?? startDay;
		const next: Record<string, number> = {
			ArrowLeft: day === null ? current : current - step,
			ArrowDown: day === null ? current : current - step,
			ArrowRight: day === null ? current : current + step,
			ArrowUp: day === null ? current : current + step,
			Home: range.min,
			End: range.max,
		};
		if (e.key in next) {
			e.preventDefault();
			setDay(next[e.key]);
		} else if (e.key === "Delete" || e.key === "Backspace") {
			e.preventDefault();
			setDateFilter(null);
		}
	};

	const scrubFromPointer = (e: PointerEvent<HTMLDivElement>) => {
		if (!layout) return;
		const rect = e.currentTarget.getBoundingClientRect();
		setDay(layout.dayAt(e.clientX - rect.left));
	};

	const ticks: number[] = [];
	if (layout) {
		// Weekly ticks on Mondays: UTC day 0 (1 Jan 1970) was a Thursday, so
		// Mondays are the days with d mod 7 = 4.
		const firstMonday = range.min + ((((4 - range.min) % 7) + 7) % 7);
		for (let d = firstMonday; d <= range.max + 1; d += TICK_EVERY_DAYS)
			ticks.push(d);
	}

	return (
		<TooltipProvider delayDuration={150}>
			<div
				ref={wrapRef}
				className="relative w-full select-none"
				style={{ height }}
			>
				{health.isError && (
					<button
						type="button"
						onClick={() => health.refetch()}
						className="absolute top-0 right-2 z-10 text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-200 hover:underline"
					>
						Demo date unavailable (no "today" line) · Retry
					</button>
				)}
				{/* Row labels (HTML so long titles truncate cleanly). */}
				{rows.map((r, i) => (
					<div
						key={r.work.id}
						className={cn(
							"absolute left-0 flex items-center gap-1.5 pr-2 pl-3 text-[11px]",
							day !== null && !isSpanActive(r, day) && "opacity-40",
						)}
						style={{ top: AXIS_H + i * ROW_H, height: ROW_H, width: LABEL_W }}
						title={workLine(r.work)}
					>
						<span className="shrink-0 font-mono text-zinc-500">
							{r.work.id}
						</span>
						<span
							className="min-w-0 truncate"
							style={{ color: SCHEDULE_COLORS.rowLabel }}
						>
							{r.work.title}
						</span>
						{(r.work.origin === "INTAKE" || r.work.id === fresh) && (
							<span
								className="shrink-0 rounded px-1 text-[9px] font-semibold uppercase"
								style={{ color: WORK_COLOR, border: `1px solid ${WORK_COLOR}` }}
							>
								New
							</span>
						)}
					</div>
				))}

				{layout && (
					<div
						className="absolute top-0"
						style={{ left: LABEL_W, width: layout.plotW, height }}
					>
						<GanttSvg
							rows={rows}
							rowOf={rowOf}
							links={links}
							layout={layout}
							ticks={ticks}
							day={day}
							today={today}
							height={height}
							selectedClashId={selectedClashId}
						/>

						{/* Date scrubber: the axis band is a keyboard slider. */}
						<div
							role="slider"
							tabIndex={0}
							aria-label="Show only works active on this date in the 3D view"
							aria-valuemin={range.min}
							aria-valuemax={range.max}
							aria-valuenow={day ?? startDay}
							aria-valuetext={
								day === null
									? "No date filter"
									: `Active on ${formatDate(dateFilter)}`
							}
							className="absolute top-0 left-0 cursor-ew-resize rounded-sm focus-visible:outline-2 focus-visible:outline-zinc-300"
							style={{ width: layout.plotW, height: AXIS_H }}
							onKeyDown={onKeyDown}
							onPointerDown={(e) => {
								e.currentTarget.setPointerCapture(e.pointerId);
								scrubFromPointer(e);
							}}
							onPointerMove={(e) => {
								if (e.currentTarget.hasPointerCapture(e.pointerId))
									scrubFromPointer(e);
							}}
						/>

						{links.map((link) => (
							<LinkButton
								key={link.clash.id}
								link={link}
								layout={layout}
								rowOf={rowOf}
								selected={link.clash.id === selectedClashId}
								onSelect={() => selectClash(link.clash.id)}
							/>
						))}
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}

function GanttSvg({
	rows,
	rowOf,
	links,
	layout,
	ticks,
	day,
	today,
	height,
	selectedClashId,
}: {
	rows: WorkSpan[];
	rowOf: Map<string, number>;
	links: ScheduleLink[];
	layout: Layout;
	ticks: number[];
	day: number | null;
	today: number | null;
	height: number;
	selectedClashId: string | null;
}) {
	const { x, plotW, range } = layout;
	const inRange = (d: number | null): d is number =>
		d !== null && d >= range.min && d <= range.max;

	return (
		<svg
			width={plotW}
			height={height}
			className="absolute inset-0 overflow-visible"
			aria-hidden
		>
			{/* Axis + weekly grid */}
			{ticks.map((t) => (
				<g key={t}>
					<line
						x1={x(t)}
						x2={x(t)}
						y1={AXIS_H - 6}
						y2={height}
						stroke={SCHEDULE_COLORS.grid}
					/>
					<text
						x={x(t) + 3}
						y={AXIS_H - 9}
						fontSize={10}
						fill={SCHEDULE_COLORS.axisLabel}
					>
						{shortDay(t)}
					</text>
				</g>
			))}
			<line
				x1={0}
				x2={plotW}
				y1={AXIS_H - 0.5}
				y2={AXIS_H - 0.5}
				stroke={SCHEDULE_COLORS.grid}
			/>

			{/* Work bars (start to end, end day inclusive) */}
			{rows.map((r, i) => {
				if (r.start === null || r.end === null) return null;
				const active = day === null || isSpanActive(r, day);
				return (
					<rect
						key={r.work.id}
						x={x(r.start)}
						y={layout.rowTop(i) + BAR_INSET}
						width={Math.max(2, x(r.end + 1) - x(r.start))}
						height={ROW_H - BAR_INSET * 2}
						rx={2}
						fill={WORK_COLOR}
						fillOpacity={active ? 0.85 : 0.2}
					/>
				);
			})}

			{/* Schedule links */}
			{links.map((link) => {
				const a = rowOf.get(link.first.work.id) ?? 0;
				const b = rowOf.get(link.second.work.id) ?? 0;
				const [top, bottom] = a < b ? [a, b] : [b, a];
				const selected = link.clash.id === selectedClashId;
				const stroke = selected
					? SCHEDULE_COLORS.selected
					: link.kind === "SCHEDULE_OVERLAP"
						? SCHEDULE_COLORS.overlap
						: SCHEDULE_COLORS.digOnce;
				const x1 = x(link.from);
				const x2 = x(link.to);
				const labelX = Math.max(x1, x2) + 4;
				const labelY = (layout.rowMid(top) + layout.rowMid(bottom)) / 2 + 3.5;
				return (
					<g key={link.clash.id}>
						{link.kind === "SCHEDULE_OVERLAP" ? (
							<rect
								x={x1}
								y={layout.rowTop(top) + 1}
								width={Math.max(2, x2 - x1)}
								height={layout.rowTop(bottom) + ROW_H - layout.rowTop(top) - 2}
								rx={2}
								fill={SCHEDULE_COLORS.overlap}
								fillOpacity={0.15}
								stroke={stroke}
								strokeOpacity={selected ? 1 : 0.7}
								strokeWidth={selected ? 2 : 1}
							/>
						) : (
							<path
								d={`M ${x1} ${layout.rowMid(a)} L ${x2} ${layout.rowMid(b)}`}
								fill="none"
								stroke={stroke}
								strokeWidth={selected ? 2.5 : 1.5}
								strokeDasharray="4 3"
							/>
						)}
						<text
							x={labelX}
							y={labelY}
							fontSize={10}
							fill={stroke}
							stroke={SCHEDULE_COLORS.scrubberLabelBg}
							strokeWidth={3}
							paintOrder="stroke"
						>
							{link.days} d
						</text>
					</g>
				);
			})}

			{/* Demo "today" */}
			{inRange(today) && (
				<g>
					<line
						x1={x(today) + 0.5}
						x2={x(today) + 0.5}
						y1={AXIS_H}
						y2={height}
						stroke={SCHEDULE_COLORS.today}
						strokeDasharray="2 2"
					/>
					<text
						x={x(today) + 3}
						y={height - 3}
						fontSize={9}
						fill={SCHEDULE_COLORS.today}
					>
						Today
					</text>
				</g>
			)}

			{/* Scrubber */}
			{inRange(day) && (
				<g>
					<rect
						x={x(day)}
						y={AXIS_H}
						width={Math.max(1, x(day + 1) - x(day))}
						height={height - AXIS_H}
						fill={SCHEDULE_COLORS.scrubber}
						fillOpacity={0.08}
					/>
					<line
						x1={x(day + 0.5)}
						x2={x(day + 0.5)}
						y1={2}
						y2={height}
						stroke={SCHEDULE_COLORS.scrubber}
						strokeWidth={1.5}
					/>
					<rect
						x={x(day + 0.5) - 22}
						y={2}
						width={44}
						height={14}
						rx={3}
						fill={SCHEDULE_COLORS.scrubber}
					/>
					<text
						x={x(day + 0.5)}
						y={12.5}
						fontSize={10}
						fontWeight={600}
						textAnchor="middle"
						fill={SCHEDULE_COLORS.scrubberLabelBg}
					>
						{shortDay(day)}
					</text>
				</g>
			)}
		</svg>
	);
}

/** Invisible, focusable hit area over a link, wider than the drawn line. */
function LinkButton({
	link,
	layout,
	rowOf,
	selected,
	onSelect,
}: {
	link: ScheduleLink;
	layout: Layout;
	rowOf: Map<string, number>;
	selected: boolean;
	onSelect: () => void;
}) {
	const a = rowOf.get(link.first.work.id) ?? 0;
	const b = rowOf.get(link.second.work.id) ?? 0;
	const top = layout.rowTop(Math.min(a, b));
	const bottom = layout.rowTop(Math.max(a, b)) + ROW_H;
	const x1 = layout.x(link.from);
	const x2 = layout.x(link.to);
	let left = Math.min(x1, x2) - HIT_PAD_PX;
	let width = Math.abs(x2 - x1) + HIT_PAD_PX * 2;
	if (width < MIN_HIT_PX) {
		left -= (MIN_HIT_PX - width) / 2;
		width = MIN_HIT_PX;
	}
	const kind = humanizeEnum(link.kind);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onSelect}
					aria-pressed={selected}
					aria-label={`${kind}, ${linkLabel(link)}: ${link.first.work.id} and ${link.second.work.id}. Select clash ${link.clash.id}.`}
					className="absolute cursor-pointer rounded-sm hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-zinc-200"
					style={{ left, top, width, height: bottom - top }}
				/>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				className="max-w-md border-zinc-700 bg-zinc-900 text-xs text-zinc-200"
			>
				<p className="font-medium">
					{kind} · {linkLabel(link)} ·{" "}
					<span className="font-mono">{link.clash.id}</span>
				</p>
				<p className="mt-1 text-zinc-400">{workLine(link.first.work)}</p>
				<p className="text-zinc-400">{workLine(link.second.work)}</p>
			</TooltipContent>
		</Tooltip>
	);
}
