import { Crosshair, Maximize2, X, ZoomIn } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Clash, Point2, Scene, Utility } from "@/api/types";
import { DockBar, type DockChrome } from "@/components/BottomDock";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { SECTION_COLORS, UTILITY_COLORS, WORK_COLOR } from "@/lib/colors";
import {
	formatClearance,
	formatMetres,
	formatUncertainty,
	utilityLabel,
} from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";
import {
	type CutCircle,
	clashPresence,
	compassName,
	type Dimension,
	dimensionFor,
	offsetRange,
	type SectionCut,
	type SectionState,
	snapSectionToClash,
	streetSection,
	UNKNOWN_DEPTH_BAND,
} from "./sectionGeometry";
import { useElementSize } from "./useElementSize";

const PAD = { left: 40, right: 12, top: 22, bottom: 10 };
/** Depth shown above the road surface, for street labels (m). */
const ABOVE_SURFACE_M = 0.6;
/** Zoomed view: at least this much depth and width around the clash (m). */
const ZOOM_MIN_DEPTH_SPAN_M = 2.4;
const ZOOM_MIN_WIDTH_SPAN_M = 4;
/** Drawn and engine gaps further apart than this get a note (m). */
const GAP_NOTE_THRESHOLD_M = 0.05;
/** Never draw a pipe smaller than this on screen (px radius). */
const MIN_CIRCLE_PX = 2;

type ZoomPref = "auto" | "street" | "clash";

interface View {
	x: (u: number) => number;
	y: (depth: number) => number;
	/** px per metre */
	s: number;
	uMin: number;
	uMax: number;
	dMin: number;
	dMax: number;
}

function makeView(
	width: number,
	height: number,
	uCentre: number,
	uSpan: number,
	dTop: number,
	dSpan: number,
): View {
	const innerW = Math.max(1, width - PAD.left - PAD.right);
	const innerH = Math.max(1, height - PAD.top - PAD.bottom);
	const s = Math.min(innerW / uSpan, innerH / dSpan);
	const cx = PAD.left + innerW / 2;
	return {
		x: (u) => cx + (u - uCentre) * s,
		y: (d) => PAD.top + (d - dTop) * s,
		s,
		uMin: uCentre - innerW / 2 / s,
		uMax: uCentre + innerW / 2 / s,
		dMin: dTop,
		dMax: dTop + innerH / s,
	};
}

function circleColor(c: CutCircle): string {
	return c.owner === "work"
		? WORK_COLOR
		: c.utility
			? UTILITY_COLORS[c.utility]
			: WORK_COLOR;
}

/** Selected clash's location in cut coordinates [u, depth]. */
function clashInCut(cut: SectionCut, clash: Clash): Point2 {
	const { origin, across } = cut.frame;
	const u =
		(clash.location.x - origin[0]) * across[0] +
		(clash.location.y - origin[1]) * across[1];
	return [u, -clash.location.z];
}

export function CrossSection({
	scene,
	clashes,
	section,
	cut,
	chrome,
}: {
	scene: Scene;
	clashes: Clash[];
	section: SectionState;
	cut: SectionCut;
	/** Bar parts from the workspace bottom dock (tabs, collapse). */
	chrome: DockChrome;
}) {
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const halos = useAppStore((s) => s.halos);
	const layers = useAppStore((s) => s.layers);
	const { collapsed } = chrome;
	const setSection = useAppStore((s) => s.setSection);
	const setSectionEnabled = useAppStore((s) => s.setSectionEnabled);

	const clash = useMemo(
		() => clashes.find((c) => c.id === selectedClashId) ?? null,
		[clashes, selectedClashId],
	);

	const [zoomPref, setZoomPref] = useState<ZoomPref>("auto");
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset the zoom choice whenever the selection changes
	useEffect(() => setZoomPref("auto"), [selectedClashId]);

	const range = useMemo(
		() =>
			offsetRange(
				{ anchor: section.anchor, normal: section.normal },
				scene.area.bounds,
			),
		[section.anchor, section.normal, scene.area.bounds],
	);

	const presence = useMemo(
		() => (clash ? clashPresence(cut, clash) : null),
		[cut, clash],
	);
	const dimension = useMemo(
		() => (clash ? dimensionFor(cut, clash) : null),
		[cut, clash],
	);
	const inCut = presence?.work === true && presence.asset;
	const focus: Point2 | null = useMemo(() => {
		if (!clash || !inCut) return null;
		if (dimension)
			return [
				(dimension.from[0] + dimension.to[0]) / 2,
				(dimension.from[1] + dimension.to[1]) / 2,
			];
		return clashInCut(cut, clash);
	}, [clash, inCut, dimension, cut]);

	const zoomed =
		focus !== null && (zoomPref === "clash" || zoomPref === "auto");

	const streetId =
		section.source.kind === "street" ? section.source.streetId : "";
	const title =
		section.source.kind === "street"
			? (scene.streets.find((s) => s.id === streetId)?.name ?? "Street")
			: `Through ${section.source.clashId}`;
	const origin = cut.frame.origin;

	const hiddenUtility = useMemo<Utility | null>(() => {
		const asset = clash
			? scene.assets.find((a) => a.id === clash.asset_ids[0])
			: undefined;
		return asset && !layers[asset.utility] ? asset.utility : null;
	}, [clash, scene.assets, layers]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<DockBar chrome={chrome}>
				<Select
					value={streetId}
					onValueChange={(id) => {
						const street = scene.streets.find((s) => s.id === id);
						const next = street ? streetSection(street) : null;
						if (next) setSection(next);
					}}
				>
					<SelectTrigger
						className="h-7 w-44 border-zinc-800 bg-zinc-900 text-xs"
						aria-label="Cut across street"
					>
						<SelectValue placeholder={title} />
					</SelectTrigger>
					<SelectContent>
						{scene.streets.map((s) => (
							<SelectItem key={s.id} value={s.id} className="text-xs">
								{s.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Slider
					className="w-36 min-w-20"
					min={range[0]}
					max={range[1]}
					step={0.1}
					value={[Math.min(Math.max(section.offset, range[0]), range[1])]}
					onValueChange={([v]) => setSection({ ...section, offset: v })}
					aria-label="Move section plane"
				/>
				<span className="hidden min-w-0 truncate font-mono text-xs text-zinc-400 lg:inline">
					x {origin[0].toFixed(1)} · y {origin[1].toFixed(1)} m · looking{" "}
					{compassName(section.normal)}
				</span>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					{focus !== null && (
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs text-zinc-300"
							onClick={() => setZoomPref(zoomed ? "street" : "clash")}
						>
							{zoomed ? (
								<Maximize2 className="size-3.5" aria-hidden />
							) : (
								<ZoomIn className="size-3.5" aria-hidden />
							)}
							{zoomed ? "Full cut" : "Zoom to clash"}
						</Button>
					)}
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-zinc-400"
						onClick={() => setSectionEnabled(false)}
						aria-label="Close cross-section"
					>
						<X className="size-4" aria-hidden />
					</Button>
				</div>
			</DockBar>

			{!collapsed && (
				<div className="relative min-h-0 flex-1">
					<SectionDrawing
						cut={cut}
						clash={clash}
						dimension={dimension}
						focus={zoomed ? focus : null}
						halos={halos}
					/>
					<Notes
						clash={clash}
						inCut={inCut}
						dimension={dimension}
						cut={cut}
						hiddenUtility={hiddenUtility}
						onMoveToClash={() => {
							if (!clash) return;
							const next = snapSectionToClash(scene, clash);
							if (next) setSection(next);
						}}
					/>
				</div>
			)}
		</div>
	);
}

function Notes({
	clash,
	inCut,
	dimension,
	cut,
	hiddenUtility,
	onMoveToClash,
}: {
	clash: Clash | null;
	inCut: boolean;
	dimension: Dimension | null;
	cut: SectionCut;
	hiddenUtility: Utility | null;
	onMoveToClash: () => void;
}) {
	const notes: string[] = [];
	const alongIds = new Map<string, number>();
	for (const l of cut.along)
		alongIds.set(l.id, Math.min(alongIds.get(l.id) ?? Infinity, l.distance));
	for (const [id, d] of [...alongIds].slice(0, 3))
		notes.push(
			`${id} runs along the cut (${d.toFixed(2)} m away), not across it.`,
		);
	if (alongIds.size > 3)
		notes.push(`+${alongIds.size - 3} more along the cut.`);

	let notInCut = false;
	if (clash) {
		const schedule =
			clash.kind === "SCHEDULE_OVERLAP" || clash.kind === "DIG_ONCE";
		if (schedule)
			notes.unshift(
				`${clash.id} is a schedule clash: no clearance dimension applies.`,
			);
		else if (hiddenUtility)
			notes.unshift(
				`${utilityLabel(hiddenUtility)} layer is hidden; the clearance label still applies.`,
			);
		else if (!inCut) notInCut = true;
		if (clash.certainty === "NEEDS_DATA" && clash.missing_data.length > 0)
			notes.unshift(
				`Missing: ${clash.missing_data.join(", ")}. Gap not computed.`,
			);
		if (
			dimension &&
			clash.measured_gap_m !== null &&
			Math.abs(dimension.drawnGap - clash.measured_gap_m) > GAP_NOTE_THRESHOLD_M
		)
			notes.push(
				`Drawn in this cut: ${formatMetres(dimension.drawnGap)}. The label is the engine's 3D closest approach.`,
			);
	}

	if (notes.length === 0 && !notInCut) return null;
	return (
		<div className="pointer-events-none absolute top-2 right-3 flex max-w-xs flex-col items-end gap-1 text-right text-xs text-zinc-400">
			{notInCut && clash && (
				<div className="pointer-events-auto flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950/90 px-2 py-1">
					<span>{clash.id} is not in this cut.</span>
					<Button
						variant="outline"
						size="sm"
						className="h-6 border-zinc-700 bg-transparent px-2 text-xs"
						onClick={onMoveToClash}
					>
						<Crosshair className="size-3" aria-hidden />
						Move section to clash
					</Button>
				</div>
			)}
			{notes.map((n) => (
				<p key={n} className="rounded bg-zinc-950/80 px-1.5 py-0.5">
					{n}
				</p>
			))}
		</div>
	);
}

function SectionDrawing({
	cut,
	clash,
	dimension,
	focus,
	halos,
}: {
	cut: SectionCut;
	clash: Clash | null;
	dimension: Dimension | null;
	/** Zoom centre [u, depth], or null for the full cut. */
	focus: Point2 | null;
	halos: boolean;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const { width, height } = useElementSize(ref);

	const view = useMemo(() => {
		if (width === 0 || height === 0) return null;
		if (focus) {
			const spanU = Math.max(
				ZOOM_MIN_WIDTH_SPAN_M,
				dimension ? Math.abs(dimension.to[0] - dimension.from[0]) + 2 : 0,
			);
			const spanD = Math.max(
				ZOOM_MIN_DEPTH_SPAN_M,
				dimension ? Math.abs(dimension.to[1] - dimension.from[1]) + 1 : 0,
			);
			const innerH = height - PAD.top - PAD.bottom;
			const innerW = width - PAD.left - PAD.right;
			const s = Math.min(innerW / spanU, innerH / spanD);
			const dTop = Math.max(-ABOVE_SURFACE_M, focus[1] - innerH / 2 / s);
			return makeView(width, height, focus[0], spanU, dTop, spanD);
		}
		const hw = cut.frame.halfWidth;
		return makeView(
			width,
			height,
			0,
			hw * 2,
			-ABOVE_SURFACE_M,
			cut.maxDepth + ABOVE_SURFACE_M,
		);
	}, [width, height, focus, dimension, cut]);

	const involved = useMemo(
		() => new Set(clash ? [...clash.asset_ids, ...clash.work_ids] : []),
		[clash],
	);

	return (
		<div ref={ref} className="absolute inset-0">
			{view && (
				<svg
					width={width}
					height={height}
					role="img"
					aria-label="Cross-section through the selected cut: pipes at depth and excavation outlines"
					className="block select-none"
				>
					<defs>
						<clipPath id="section-clip">
							<rect
								x={PAD.left}
								y={PAD.top - 16}
								width={width - PAD.left - PAD.right}
								height={height - PAD.top - PAD.bottom + 16}
							/>
						</clipPath>
						<marker
							id="section-arrow"
							viewBox="0 0 10 10"
							refX="9"
							refY="5"
							markerWidth="7"
							markerHeight="7"
							orient="auto-start-reverse"
						>
							<path d="M0,0 L10,5 L0,10 z" fill={SECTION_COLORS.dimension} />
						</marker>
					</defs>

					<DepthGrid view={view} />

					<g clipPath="url(#section-clip)">
						<Surface view={view} cut={cut} />
						<Body view={view} cut={cut} involved={involved} halos={halos} />
						{clash && (
							<ClashOverlay
								view={view}
								cut={cut}
								clash={clash}
								dimension={dimension}
							/>
						)}
					</g>
					<ScaleBar view={view} width={width} height={height} />
				</svg>
			)}
		</div>
	);
}

function DepthGrid({ view }: { view: View }) {
	const step = view.s >= 80 ? 0.5 : 1;
	const lines: number[] = [];
	for (
		let d = Math.ceil(Math.max(0, view.dMin) / step) * step;
		d <= view.dMax;
		d += step
	)
		lines.push(Number(d.toFixed(2)));
	return (
		<g>
			{lines.map((d) => (
				<g key={d}>
					<line
						x1={PAD.left}
						x2={view.x(view.uMax)}
						y1={view.y(d)}
						y2={view.y(d)}
						stroke={SECTION_COLORS.grid}
						strokeWidth={1}
					/>
					<text
						x={PAD.left - 6}
						y={view.y(d) + 3}
						textAnchor="end"
						fontSize={10}
						fill={SECTION_COLORS.gridLabel}
						className="font-mono"
					>
						{d === 0 ? "0" : `${d} m`}
					</text>
				</g>
			))}
		</g>
	);
}

function Surface({ view, cut }: { view: View; cut: SectionCut }) {
	const y0 = view.y(0);
	return (
		<g>
			<line
				x1={view.x(view.uMin)}
				x2={view.x(view.uMax)}
				y1={y0}
				y2={y0}
				stroke={SECTION_COLORS.surface}
				strokeWidth={1.5}
			/>
			{cut.streets.map((st) => (
				<g key={st.id}>
					{st.kerbs?.map((k) => (
						<line
							key={k}
							x1={view.x(k)}
							x2={view.x(k)}
							y1={y0}
							y2={y0 - 8}
							stroke={SECTION_COLORS.kerb}
							strokeWidth={1.5}
						/>
					))}
					<text
						x={view.x(st.u)}
						y={y0 - 6}
						textAnchor="middle"
						fontSize={10}
						fill={SECTION_COLORS.gridLabel}
					>
						{st.name}
					</text>
				</g>
			))}
		</g>
	);
}

function Body({
	view,
	cut,
	involved,
	halos,
}: {
	view: View;
	cut: SectionCut;
	involved: Set<string>;
	halos: boolean;
}) {
	const { s } = view;
	const showAllLabels = s >= 40;
	return (
		<g>
			{cut.rects.map((r) => {
				const hot = involved.has(r.workId);
				return (
					<rect
						key={`${r.workId}:${r.u0}`}
						x={view.x(r.u0)}
						y={view.y(r.top)}
						width={Math.max(1, (r.u1 - r.u0) * s)}
						height={Math.max(1, (r.bottom - r.top) * s)}
						fill={WORK_COLOR}
						fillOpacity={hot ? 0.25 : 0.14}
						stroke={WORK_COLOR}
						strokeWidth={hot ? 2 : 1}
					/>
				);
			})}

			{cut.along.map((l) => {
				const color =
					l.owner === "work" || !l.utility
						? WORK_COLOR
						: UTILITY_COLORS[l.utility];
				return (
					<line
						key={`along:${l.id}:${l.u0}`}
						x1={view.x(l.u0)}
						x2={view.x(l.u1)}
						y1={view.y(l.depth0)}
						y2={view.y(l.depth1)}
						stroke={color}
						strokeOpacity={0.55}
						strokeWidth={2}
						strokeDasharray="6 4"
					/>
				);
			})}

			{cut.circles.map((c) => {
				const color = circleColor(c);
				const r = Math.max(MIN_CIRCLE_PX, c.radius * s);
				const cx = view.x(c.u);
				const cy = view.y(c.depth);
				const hot = involved.has(c.id);
				return (
					<g key={`${c.owner}:${c.id}:${c.u.toFixed(3)}`}>
						{!c.depthKnown && (
							<>
								<rect
									x={cx - r}
									y={view.y(UNKNOWN_DEPTH_BAND[0])}
									width={r * 2}
									height={(UNKNOWN_DEPTH_BAND[1] - UNKNOWN_DEPTH_BAND[0]) * s}
									fill={color}
									fillOpacity={0.06}
									stroke={color}
									strokeOpacity={0.6}
									strokeDasharray="3 3"
								/>
								<text
									x={cx + r + 4}
									y={view.y(UNKNOWN_DEPTH_BAND[1]) - 4}
									fontSize={10}
									fill={color}
								>
									depth unknown · {UNKNOWN_DEPTH_BAND[0]}–
									{UNKNOWN_DEPTH_BAND[1]} m checked
								</text>
							</>
						)}
						{halos && c.depthKnown && c.horizPrecision !== null && (
							<ellipse
								cx={cx}
								cy={cy}
								rx={(c.radius + c.horizPrecision) * s}
								ry={(c.radius + (c.depthPrecision ?? 0)) * s}
								fill={color}
								fillOpacity={0.08}
								stroke={color}
								strokeOpacity={0.3}
							/>
						)}
						<circle
							cx={cx}
							cy={cy}
							r={r}
							fill={color}
							fillOpacity={c.depthKnown ? 1 : 0.35}
							stroke={hot ? SECTION_COLORS.dimension : color}
							strokeWidth={hot ? 1.5 : 1}
							strokeDasharray={c.depthKnown ? undefined : "2 2"}
						/>
						{(showAllLabels || hot) && (
							<text
								x={cx}
								y={cy + r + 11}
								textAnchor="middle"
								fontSize={9}
								fill={color}
								className="font-mono"
							>
								{c.id}
							</text>
						)}
					</g>
				);
			})}
		</g>
	);
}

function ClashOverlay({
	view,
	cut,
	clash,
	dimension,
}: {
	view: View;
	cut: SectionCut;
	clash: Clash;
	dimension: Dimension | null;
}) {
	const { s } = view;
	const required = clash.required_clearance_m;
	const spatial = clash.kind === "INTERSECTION" || clash.kind === "CLEARANCE";
	if (!spatial) return null;

	// Required-clearance envelope around the work shape that is measured.
	let envelope: ReactNode = null;
	if (required !== null) {
		const shape =
			dimension?.workShape ??
			(() => {
				const rect = cut.rects.find((r) => r.workId === clash.work_ids[0]);
				return rect ? ({ kind: "rect", rect } as const) : null;
			})();
		if (shape?.kind === "rect") {
			const { rect } = shape;
			const top = Math.max(0, rect.top - required);
			envelope = (
				<rect
					x={view.x(rect.u0 - required)}
					y={view.y(top)}
					width={(rect.u1 - rect.u0 + required * 2) * s}
					height={(rect.bottom + required - top) * s}
					fill="none"
					stroke={SECTION_COLORS.envelope}
					strokeDasharray="4 3"
					strokeWidth={1}
				/>
			);
		} else if (shape?.kind === "circle") {
			const { circle } = shape;
			envelope = (
				<circle
					cx={view.x(circle.u)}
					cy={view.y(circle.depth)}
					r={(circle.radius + required) * s}
					fill="none"
					stroke={SECTION_COLORS.envelope}
					strokeDasharray="4 3"
					strokeWidth={1}
				/>
			);
		}
	}

	// Label: always the engine's numbers.
	const anchor: Point2 = dimension
		? [
				Math.max(dimension.from[0], dimension.to[0]),
				(dimension.from[1] + dimension.to[1]) / 2,
			]
		: clashInCut(cut, clash);
	const lx = view.x(anchor[0]) + 10;
	const ly = view.y(anchor[1]);
	const flip = lx > view.x(view.uMax) - 200;
	const line1 = formatClearance(clash.measured_gap_m, required);
	const line2 =
		clash.uncertainty_m !== null
			? `${formatUncertainty(clash.uncertainty_m)} uncertainty`
			: clash.certainty === "NEEDS_DATA"
				? "uncertainty unknown (depth missing)"
				: null;

	return (
		<g>
			{envelope}
			{dimension && (
				<line
					x1={view.x(dimension.from[0])}
					y1={view.y(dimension.from[1])}
					x2={view.x(dimension.to[0])}
					y2={view.y(dimension.to[1])}
					stroke={SECTION_COLORS.dimension}
					strokeWidth={1.5}
					markerStart="url(#section-arrow)"
					markerEnd="url(#section-arrow)"
				/>
			)}
			<g transform={`translate(${flip ? view.x(anchor[0]) - 10 : lx}, ${ly})`}>
				<text
					textAnchor={flip ? "end" : "start"}
					fontSize={12}
					fontWeight={600}
					fill={SECTION_COLORS.dimension}
					stroke={SECTION_COLORS.labelBg}
					strokeWidth={4}
					paintOrder="stroke"
					className="font-mono"
				>
					<tspan x={0} dy={-2}>
						{line1}
					</tspan>
					{line2 && (
						<tspan x={0} dy={14} fontSize={10} fontWeight={400}>
							{line2}
						</tspan>
					)}
				</text>
			</g>
		</g>
	);
}

function ScaleBar({
	view,
	width,
	height,
}: {
	view: View;
	width: number;
	height: number;
}) {
	const metres = view.s >= 120 ? 0.5 : view.s >= 30 ? 1 : 5;
	const len = metres * view.s;
	const x1 = width - PAD.right - len;
	const y = height - PAD.bottom - 2;
	return (
		<g>
			<line
				x1={x1}
				x2={x1 + len}
				y1={y}
				y2={y}
				stroke={SECTION_COLORS.gridLabel}
				strokeWidth={2}
			/>
			<text
				x={x1 + len / 2}
				y={y - 4}
				textAnchor="middle"
				fontSize={10}
				fill={SECTION_COLORS.gridLabel}
				className="font-mono"
			>
				{metres} m (1:1)
			</text>
		</g>
	);
}
