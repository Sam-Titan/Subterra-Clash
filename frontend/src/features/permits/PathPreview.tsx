import { AlertTriangle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import type { PermitDraft, Point2, Scene } from "@/api/types";
import { ErrorBlock, LoadingBlock } from "@/components/QueryState";
import { INTAKE_COLORS, WORK_COLOR } from "@/lib/colors";
import { planToSvg } from "@/lib/coords";
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
		return {
			streets: s.streets.map((st) => ({ ...st, d: svgPath(st.centerline, s) })),
			works: s.works.map((w) => ({ id: w.id, d: svgPath(w.path, s) })),
		};
	}, [scene.data]);

	const header = (
		<div className="flex flex-wrap items-baseline justify-between gap-2">
			<h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
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
				<li className="text-[11px] font-semibold text-zinc-500">
					Geocoder notes
				</li>
				{geocode.notes.length === 0 ? (
					<li className="text-zinc-500">None.</li>
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
				viewBox={`-10 -10 ${width + 20} ${height + 20}`}
				className="w-full rounded-md border border-zinc-800"
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
				{base.streets.map((st) => {
					const mid = st.centerline[Math.floor((st.centerline.length - 1) / 2)];
					const next =
						st.centerline[Math.floor((st.centerline.length - 1) / 2) + 1] ??
						mid;
					const [x, y] = planToSvg(
						[(mid[0] + next[0]) / 2, (mid[1] + next[1]) / 2],
						bounds,
					);
					return (
						<text
							key={`${st.id}-l`}
							x={x}
							y={y - st.width_m / 2 - 3}
							fontSize={10}
							textAnchor="middle"
							fill={INTAKE_COLORS.previewLabel}
						>
							{st.name}
						</text>
					);
				})}
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
			<p className="text-[11px] text-zinc-500">
				{`North up. Pink line = this permit${
					geocode.status === "PARTIAL" ? " (dashed: centreline placement)" : ""
				}; faint pink = works already in the plan; white = the permit's from / to references.`}
			</p>
			{notes}
		</section>
	);
}
