import { AlertTriangle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import type { PermitDraft, Point2, Scene } from "@/api/types";
import { ErrorBlock, LoadingBlock } from "@/components/QueryState";
import { cardClass } from "@/components/ui/card";
import { INTAKE_COLORS, WORK_COLOR } from "@/lib/colors";
import { planToSvg } from "@/lib/coords";
import { cn } from "@/lib/utils";
import { fieldOf } from "./permitFields";

function svgPath(points: Point2[], scene: Scene): string {
	return points
		.map((p, i) => {
			const [x, y] = planToSvg(p, scene.area.bounds);
			return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");
}

/** "J3 — Vikas Marg × Station Road" → "J3" */
function shortName(name: string): string {
	return name.split(" — ")[0];
}

interface Box {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

const overlaps = (a: Box, b: Box) =>
	a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Rough text width in SVG units (the map uses the default sans-serif). */
const textWidth = (text: string, fontSize: number) =>
	text.length * fontSize * 0.56;

/** Point at fraction t (0 to 1) of a polyline's length. */
function pointAt(line: Point2[], t: number): Point2 {
	const lengths = line
		.slice(1)
		.map((p, i) => Math.hypot(p[0] - line[i][0], p[1] - line[i][1]));
	let rest = t * lengths.reduce((a, b) => a + b, 0);
	for (const [i, len] of lengths.entries()) {
		if (rest <= len || i === lengths.length - 1) {
			const k = len === 0 ? 0 : Math.min(rest / len, 1);
			return [
				line[i][0] + (line[i + 1][0] - line[i][0]) * k,
				line[i][1] + (line[i + 1][1] - line[i][1]) * k,
			];
		}
		rest -= len;
	}
	return line[0];
}

/** Street labels try spots along the street until one clears the other labels. */
const LABEL_SPOTS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88];

const STATUS_TEXT: Record<PermitDraft["geocode"]["status"], string> = {
	RESOLVED: "Resolved",
	PARTIAL: "Partial",
	FAILED: "Failed",
};

/**
 * North-up plan of Sector 7 with the geocoded path in work pink. The path
 * comes only from the backend's deterministic geocoder, never from the LLM.
 */
export function PathPreview({
	draft,
	scene,
}: {
	draft: PermitDraft;
	scene: {
		data: Scene | undefined;
		isPending: boolean;
		isError: boolean;
		error: unknown;
		refetch: () => void;
	};
}) {
	const reduceMotion = useReducedMotion();
	const { geocode } = draft;
	const refs = new Set(
		[fieldOf(draft, "from_ref").value, fieldOf(draft, "to_ref").value].filter(
			(v): v is string => typeof v === "string",
		),
	);
	const streetId = fieldOf(draft, "street").value;

	const base = useMemo(() => {
		const s = scene.data;
		if (!s) return null;
		const { bounds } = s.area;
		// Fixed labels first (worst case: the bold 11 px of a from/to reference),
		// then each street name takes the first free spot along its street.
		const taken: Box[] = [];
		let maxRight = 0;
		const fixed = [
			...s.junctions.map((j) => ({ ...j, label: shortName(j.name) })),
			...s.landmarks.map((l) => ({ ...l, label: l.name })),
		];
		for (const n of fixed) {
			const [x, y] = planToSvg([n.x, n.y], bounds);
			const right = x + 6 + textWidth(n.label, 11);
			maxRight = Math.max(maxRight, right);
			taken.push({ x0: x - 5, y0: y - 5, x1: right, y1: y + 14 });
		}
		const streets = s.streets.map((st) => {
			const width = textWidth(st.name, 10);
			const boxAt = (t: number) => {
				const [x, y] = planToSvg(pointAt(st.centerline, t), bounds);
				const ly = y - st.width_m / 2 - 3;
				return {
					x,
					y: ly,
					box: {
						x0: x - width / 2,
						y0: ly - 10,
						x1: x + width / 2,
						y1: ly + 2,
					},
				};
			};
			const spot =
				LABEL_SPOTS.map(boxAt).find(
					(c) => !taken.some((b) => overlaps(b, c.box)),
				) ?? boxAt(0.5);
			taken.push(spot.box);
			return { ...st, d: svgPath(st.centerline, s), label: spot };
		});
		return {
			streets,
			works: s.works.map((w) => ({ id: w.id, d: svgPath(w.path, s) })),
			maxRight,
		};
	}, [scene.data]);

	const header = (
		<div className="flex flex-wrap items-baseline justify-between gap-2">
			<h2 className="text-xs font-medium text-zinc-400">
				Placed path (geocoder)
			</h2>
			<span className="flex items-center gap-2 text-xs">
				<span
					className="rounded-full border px-2 py-px font-medium"
					style={
						geocode.status === "RESOLVED"
							? { borderColor: WORK_COLOR, color: "inherit" }
							: {
									borderColor: INTAKE_COLORS.warning,
									color: INTAKE_COLORS.warning,
								}
					}
				>
					{STATUS_TEXT[geocode.status]}
				</span>
				<span className="text-zinc-400">
					Preview:{" "}
					<span className="font-mono tabular-nums text-zinc-100">
						{draft.preview_clash_count}
					</span>{" "}
					clash{draft.preview_clash_count === 1 ? "" : "es"} if added
				</span>
			</span>
		</div>
	);

	const notes = (
		<div className="flex flex-col gap-1.5">
			{geocode.status === "PARTIAL" && (
				<div
					role="status"
					className="flex items-start gap-2 rounded-md border p-2 text-xs"
					style={{
						borderColor: INTAKE_COLORS.warning,
						color: INTAKE_COLORS.warning,
					}}
				>
					<AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
					<span>
						Partially placed: the side of the street is missing or does not fit
						this street, so the path sits on the street centreline. Its position
						is uncertain until the side is given.
					</span>
				</div>
			)}
			{geocode.status === "FAILED" && (
				<div
					role="alert"
					className="flex items-start gap-2 rounded-md border p-2 text-xs"
					style={{
						borderColor: INTAKE_COLORS.warning,
						color: INTAKE_COLORS.warning,
					}}
				>
					<AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
					<span>
						The path could not be placed, so this permit cannot be added to the
						plan yet. Pick the missing location fields above and save.
					</span>
				</div>
			)}
			<ul className="flex flex-col gap-1 rounded-md bg-zinc-900/60 p-2 text-xs text-zinc-300">
				<li className="text-xs font-medium text-zinc-400">Geocoder notes</li>
				{geocode.notes.length === 0 ? (
					<li className="text-zinc-400">None.</li>
				) : (
					geocode.notes.map((n) => <li key={n}>• {n}</li>)
				)}
			</ul>
		</div>
	);

	if (scene.isPending) {
		return (
			<section className="flex flex-col gap-2">
				{header}
				<LoadingBlock label="Loading street map…" />
				{notes}
			</section>
		);
	}
	if (scene.isError || !scene.data || !base) {
		return (
			<section className="flex flex-col gap-2">
				{header}
				<ErrorBlock
					title="Could not load the street map"
					error={scene.error}
					onRetry={scene.refetch}
				/>
				{notes}
			</section>
		);
	}

	const s = scene.data;
	const { bounds } = s.area;
	const width = bounds.max_x - bounds.min_x;
	const height = bounds.max_y - bounds.min_y;
	const nodes = [
		...s.junctions.map((j) => ({ ...j, kind: "junction" as const })),
		...s.landmarks.map((l) => ({ ...l, kind: "landmark" as const })),
	];
	const pathD = geocode.path.length > 1 ? svgPath(geocode.path, s) : null;

	return (
		<section className="flex flex-col gap-2">
			{header}
			<svg
				viewBox={`-10 -10 ${Math.max(width + 20, base.maxRight + 14)} ${height + 20}`}
				className={cn(cardClass, "w-full")}
				style={{ backgroundColor: INTAKE_COLORS.previewGround }}
				role="img"
				aria-label={
					pathD
						? `Plan of ${s.area.name} with the permit path`
						: `Plan of ${s.area.name}; the path could not be placed`
				}
			>
				{base.streets.map((st) => (
					<path
						key={st.id}
						d={st.d}
						fill="none"
						stroke={INTAKE_COLORS.previewStreet}
						strokeWidth={st.width_m}
						strokeLinecap="square"
						opacity={st.id === streetId ? 1 : 0.7}
					/>
				))}
				{base.streets.map((st) => (
					<path
						key={`${st.id}-c`}
						d={st.d}
						fill="none"
						stroke={INTAKE_COLORS.previewCentreline}
						strokeWidth={1}
						strokeDasharray="4 4"
					/>
				))}
				{base.works.map((w) => (
					<path
						key={w.id}
						d={w.d}
						fill="none"
						stroke={WORK_COLOR}
						strokeWidth={2}
						opacity={0.25}
					/>
				))}
				{base.streets.map((st) => (
					<text
						key={`${st.id}-l`}
						x={st.label.x}
						y={st.label.y}
						fontSize={10}
						textAnchor="middle"
						fill={INTAKE_COLORS.previewLabel}
					>
						{st.name}
					</text>
				))}
				{nodes.map((n) => {
					const [x, y] = planToSvg([n.x, n.y], bounds);
					const isRef = refs.has(n.id);
					const color = isRef
						? INTAKE_COLORS.previewRef
						: INTAKE_COLORS.previewNode;
					return (
						<g key={n.id}>
							{n.kind === "junction" ? (
								<circle cx={x} cy={y} r={isRef ? 4 : 2.5} fill={color} />
							) : (
								<rect
									x={x - (isRef ? 4 : 3)}
									y={y - (isRef ? 4 : 3)}
									width={isRef ? 8 : 6}
									height={isRef ? 8 : 6}
									fill={color}
								/>
							)}
							<text
								x={x + 6}
								y={y + 12}
								fontSize={isRef ? 11 : 9}
								fontWeight={isRef ? 600 : 400}
								fill={color}
							>
								{n.kind === "junction" ? shortName(n.name) : n.name}
							</text>
						</g>
					);
				})}
				{pathD && (
					<motion.path
						key={pathD}
						d={pathD}
						fill="none"
						stroke={WORK_COLOR}
						strokeWidth={5}
						strokeLinecap="round"
						// pathLength animates via the dash array, so the dashed
						// (PARTIAL) line fades in instead of drawing.
						strokeDasharray={geocode.status === "PARTIAL" ? "10 6" : undefined}
						initial={
							reduceMotion
								? false
								: geocode.status === "PARTIAL"
									? { opacity: 0 }
									: { pathLength: 0 }
						}
						animate={
							geocode.status === "PARTIAL" ? { opacity: 1 } : { pathLength: 1 }
						}
						transition={{ duration: 0.8, ease: "easeOut" }}
					/>
				)}
			</svg>
			<p className="text-xs text-zinc-400">
				{`North up. Pink line = this permit${
					geocode.status === "PARTIAL" ? " (dashed: centreline placement)" : ""
				}; faint pink = works already in the plan; white = the permit's from / to references.`}
			</p>
			{notes}
		</section>
	);
}
