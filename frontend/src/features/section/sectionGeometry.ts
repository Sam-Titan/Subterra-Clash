// Pure geometry for the vertical section plane (no React, no three.js).
//
// A section is a vertical plane through `anchor + offset · normal`, where
// `normal` is a horizontal unit vector in the scene plan (SPEC §6). The viewer
// looks along `normal`; the horizontal axis of the cut, `u`, points to the
// viewer's right, `across = (normal.y, −normal.x)`. Depth is positive downwards.
// Only items within |u| ≤ halfWidth are kept.

import type {
	Asset,
	Bounds,
	Clash,
	Point2,
	Point3,
	Scene,
	Street,
	Utility,
	Work,
} from "@/api/types";

export type SectionSource =
	| { kind: "street"; streetId: string }
	| { kind: "clash"; clashId: string };

export interface SectionState {
	anchor: Point2;
	/** Unit vector, horizontal. The viewer looks along it. */
	normal: Point2;
	halfWidth: number;
	/** Distance of the plane from `anchor` along `normal` (m). */
	offset: number;
	source: SectionSource;
}

/** Margin either side of a street's kerbs when cutting across it (m). */
export const STREET_MARGIN_M = 6;
/** Half width of the cut when it is snapped to a clash (m). */
export const CLASH_HALF_WIDTH_M = 15;
/** Plausible depth band checked for assets with unknown depth (SPEC §8.3). */
export const UNKNOWN_DEPTH_BAND: readonly [number, number] = [0.5, 3.0];
/** The cut always shows at least this much depth (m). */
export const MIN_SECTION_DEPTH_M = 5;
const DEPTH_PADDING_M = 0.3;
/** |cos| between a line and the plane normal below which it "runs along" the cut. */
const ALONG_COS = 0.2;
/** A line closer than this to the plane, and along it, is drawn as along-cut (m). */
const ALONG_DISTANCE_M = 1;
/** Keep a snapped cut this far inside the ends of the elements it cuts (m). */
const END_MARGIN_M = 0.5;

// ── small vector helpers ────────────────────────────────────────────────────

function sub(a: Point2, b: Point2): Point2 {
	return [a[0] - b[0], a[1] - b[1]];
}
function dot(a: Point2, b: Point2): number {
	return a[0] * b[0] + a[1] * b[1];
}
function unit(v: Point2): Point2 | null {
	const len = Math.hypot(v[0], v[1]);
	return len < 1e-9 ? null : [v[0] / len, v[1] / len];
}
function xy(p: Point2 | Point3): Point2 {
	return [p[0], p[1]];
}

export interface SectionFrame {
	/** Point on the plane at u = 0. */
	origin: Point2;
	normal: Point2;
	across: Point2;
	halfWidth: number;
}

export function sectionFrame(section: SectionState): SectionFrame {
	const { anchor, normal, offset, halfWidth } = section;
	return {
		origin: [anchor[0] + normal[0] * offset, anchor[1] + normal[1] * offset],
		normal,
		across: [normal[1], -normal[0]],
		halfWidth,
	};
}

/** Signed distance from the plane (d) and position along the cut (u). */
function project(frame: SectionFrame, p: Point2): { d: number; u: number } {
	const r = sub(p, frame.origin);
	return { d: dot(r, frame.normal), u: dot(r, frame.across) };
}

/** "east", "north-west", … for the viewing direction. */
export function compassName([nx, ny]: Point2): string {
	const deg = ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360;
	const names = [
		"north",
		"north-east",
		"east",
		"south-east",
		"south",
		"south-west",
		"west",
		"north-west",
	];
	return names[Math.round(deg / 45) % 8];
}

/** Range of `offset` that keeps the plane's origin inside the area bounds. */
export function offsetRange(
	section: Pick<SectionState, "anchor" | "normal">,
	bounds: Bounds,
): [number, number] {
	const { anchor, normal } = section;
	let lo = -Infinity;
	let hi = Infinity;
	const axes: [number, number, number][] = [
		[anchor[0], normal[0], 0],
		[anchor[1], normal[1], 1],
	];
	for (const [a, n, axis] of axes) {
		const min = axis === 0 ? bounds.min_x : bounds.min_y;
		const max = axis === 0 ? bounds.max_x : bounds.max_y;
		if (Math.abs(n) < 1e-9) continue;
		const t1 = (min - a) / n;
		const t2 = (max - a) / n;
		lo = Math.max(lo, Math.min(t1, t2));
		hi = Math.min(hi, Math.max(t1, t2));
	}
	if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return [0, 0];
	return [lo, hi];
}

/** Section across a street at its midpoint, looking along the street. */
export function streetSection(street: Street): SectionState | null {
	const pts = street.centerline;
	if (pts.length < 2) return null;
	const first = pts[0];
	const last = pts[pts.length - 1];
	const normal = unit(sub(last, first));
	if (!normal) return null;
	return {
		anchor: [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2],
		normal,
		halfWidth: street.width_m / 2 + STREET_MARGIN_M,
		offset: 0,
		source: { kind: "street", streetId: street.id },
	};
}

// ── the cut ────────────────────────────────────────────────────────────────

export interface CutCircle {
	/** Asset id or work id. */
	id: string;
	owner: "asset" | "work";
	utility: Utility | null;
	u: number;
	depth: number;
	radius: number;
	depthKnown: boolean;
	horizPrecision: number | null;
	depthPrecision: number | null;
}

export interface CutRect {
	workId: string;
	u0: number;
	u1: number;
	top: number;
	bottom: number;
}

/** A line element that runs along the cut instead of crossing it. */
export interface CutAlong {
	id: string;
	owner: "asset" | "work";
	utility: Utility | null;
	u0: number;
	u1: number;
	depth0: number;
	depth1: number;
	/** Horizontal distance from the plane (m). */
	distance: number;
}

export interface CutStreet {
	id: string;
	name: string;
	u: number;
	/** Kerb positions along the cut, or null when the street runs along the cut. */
	kerbs: [number, number] | null;
}

export interface SectionCut {
	frame: SectionFrame;
	circles: CutCircle[];
	rects: CutRect[];
	along: CutAlong[];
	streets: CutStreet[];
	/** Deepest point drawn (m, positive), at least MIN_SECTION_DEPTH_M. */
	maxDepth: number;
}

interface LineElement {
	id: string;
	owner: "asset" | "work";
	utility: Utility | null;
	path: Point3[];
	radius: number;
	depthKnown: boolean;
	horizPrecision: number | null;
	depthPrecision: number | null;
}

function assetLine(a: Asset): LineElement {
	return {
		id: a.id,
		owner: "asset",
		utility: a.utility,
		path: a.path as Point3[],
		radius: a.diameter_m / 2,
		depthKnown: a.depth_known,
		horizPrecision: a.horiz_precision_m,
		depthPrecision: a.depth_precision_m,
	};
}

/** HDD bore or PIPE_LAY pipe as a 3D line (SPEC §8.2); null when not a line. */
export function workLine(w: Work): LineElement | null {
	if (w.bore_diameter_m === null) return null;
	const radius = w.bore_diameter_m / 2;
	let path: Point3[] | null = null;
	if (w.work_type === "HDD" && w.bore_path) path = w.bore_path as Point3[];
	if (w.work_type === "PIPE_LAY") {
		const z = -(w.depth_to_m - radius);
		path = w.path.map(([x, y]) => [x, y, z] as Point3);
	}
	if (!path || path.length < 2) return null;
	return {
		id: w.id,
		owner: "work",
		utility: w.utility,
		path,
		radius,
		depthKnown: true,
		horizPrecision: null,
		depthPrecision: null,
	};
}

/** Excavation footprints in plan: one rectangle per TRENCH / PIPE_LAY segment, or the PIT ring. */
export function workPolygons(w: Work): Point2[][] {
	if (w.work_type === "PIT") {
		const ring = w.path.map(xy);
		return ring.length >= 3 ? [ring] : [];
	}
	if (w.work_type !== "TRENCH" && w.work_type !== "PIPE_LAY") return [];
	const half = w.width_m / 2;
	const out: Point2[][] = [];
	for (let i = 0; i < w.path.length - 1; i++) {
		const a = xy(w.path[i]);
		const b = xy(w.path[i + 1]);
		const t = unit(sub(b, a));
		if (!t) continue;
		const n: Point2 = [-t[1] * half, t[0] * half];
		out.push([
			[a[0] + n[0], a[1] + n[1]],
			[b[0] + n[0], b[1] + n[1]],
			[b[0] - n[0], b[1] - n[1]],
			[a[0] - n[0], a[1] - n[1]],
		]);
	}
	return out;
}

/** Where a 3D polyline meets the plane, plus any part of it running along the plane. */
function cutLine(
	frame: SectionFrame,
	line: LineElement,
): { circles: CutCircle[]; along: CutAlong[] } {
	const circles: CutCircle[] = [];
	const along: CutAlong[] = [];
	const { path } = line;
	for (let i = 0; i < path.length - 1; i++) {
		const p = path[i];
		const q = path[i + 1];
		const a = project(frame, xy(p));
		const b = project(frame, xy(q));
		const dir = unit(sub(xy(q), xy(p)));
		if (!dir) continue;

		const alongCut = Math.abs(dot(dir, frame.normal)) < ALONG_COS;
		if (alongCut) {
			const dist = Math.min(Math.abs(a.d), Math.abs(b.d));
			const lo = Math.min(a.u, b.u);
			const hi = Math.max(a.u, b.u);
			if (
				dist <= ALONG_DISTANCE_M &&
				hi >= -frame.halfWidth &&
				lo <= frame.halfWidth
			) {
				const forward = a.u <= b.u;
				along.push({
					id: line.id,
					owner: line.owner,
					utility: line.utility,
					u0: Math.max(lo, -frame.halfWidth),
					u1: Math.min(hi, frame.halfWidth),
					depth0: -(forward ? p : q)[2],
					depth1: -(forward ? q : p)[2],
					distance: dist,
				});
			}
			continue;
		}

		// Half-open test so a vertex lying on the plane is counted once.
		if (a.d < 0 === b.d < 0) continue;
		const t = a.d / (a.d - b.d);
		const u = a.u + (b.u - a.u) * t;
		if (Math.abs(u) > frame.halfWidth) continue;
		const z = p[2] + (q[2] - p[2]) * t;
		circles.push({
			id: line.id,
			owner: line.owner,
			utility: line.utility,
			u,
			depth: -z,
			radius: line.radius,
			depthKnown: line.depthKnown,
			horizPrecision: line.horizPrecision,
			depthPrecision: line.depthPrecision,
		});
	}
	return { circles, along };
}

/** Intervals of u where the cut line is inside a simple polygon (even–odd). */
function polygonIntervals(
	frame: SectionFrame,
	ring: Point2[],
): [number, number][] {
	const us: number[] = [];
	for (let i = 0; i < ring.length; i++) {
		const a = project(frame, ring[i]);
		const b = project(frame, ring[(i + 1) % ring.length]);
		if (a.d < 0 === b.d < 0) continue;
		const t = a.d / (a.d - b.d);
		us.push(a.u + (b.u - a.u) * t);
	}
	us.sort((x, y) => x - y);
	const out: [number, number][] = [];
	for (let i = 0; i + 1 < us.length; i += 2) out.push([us[i], us[i + 1]]);
	return out;
}

function mergeIntervals(list: [number, number][]): [number, number][] {
	const sorted = [...list].sort((a, b) => a[0] - b[0]);
	const out: [number, number][] = [];
	for (const [a, b] of sorted) {
		const last = out[out.length - 1];
		if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
		else out.push([a, b]);
	}
	return out;
}

export interface CutFilter {
	/** Utility layers that are visible. */
	utilities: (u: Utility) => boolean;
	works: boolean;
}

const SHOW_ALL: CutFilter = { utilities: () => true, works: true };

export function cutScene(
	scene: Scene,
	section: SectionState,
	filter: CutFilter = SHOW_ALL,
): SectionCut {
	const frame = sectionFrame(section);
	const hw = frame.halfWidth;
	const circles: CutCircle[] = [];
	const rects: CutRect[] = [];
	const along: CutAlong[] = [];

	for (const asset of scene.assets) {
		if (!filter.utilities(asset.utility)) continue;
		const cut = cutLine(frame, assetLine(asset));
		circles.push(...cut.circles);
		along.push(...cut.along);
	}

	if (filter.works) {
		for (const work of scene.works) {
			const intervals: [number, number][] = [];
			for (const ring of workPolygons(work))
				intervals.push(...polygonIntervals(frame, ring));
			for (const [a, b] of mergeIntervals(intervals)) {
				const u0 = Math.max(a, -hw);
				const u1 = Math.min(b, hw);
				if (u1 <= u0) continue;
				rects.push({
					workId: work.id,
					u0,
					u1,
					top: work.depth_from_m,
					bottom: work.depth_to_m,
				});
			}
			const line = workLine(work);
			if (line) {
				const cut = cutLine(frame, line);
				circles.push(...cut.circles);
				along.push(...cut.along);
			}
		}
	}

	const streets: CutStreet[] = [];
	for (const street of scene.streets) {
		const pts = street.centerline;
		for (let i = 0; i < pts.length - 1; i++) {
			const a = project(frame, pts[i]);
			const b = project(frame, pts[i + 1]);
			if (a.d < 0 === b.d < 0) continue;
			const t = a.d / (a.d - b.d);
			const u = a.u + (b.u - a.u) * t;
			if (Math.abs(u) > hw + street.width_m) continue;
			const dir = unit(sub(pts[i + 1], pts[i]));
			const cos = dir ? Math.abs(dot(dir, frame.normal)) : 0;
			const halfKerb = cos > ALONG_COS ? street.width_m / 2 / cos : null;
			streets.push({
				id: street.id,
				name: street.name,
				u,
				kerbs: halfKerb === null ? null : [u - halfKerb, u + halfKerb],
			});
		}
	}

	let deepest = 0;
	for (const c of circles)
		deepest = Math.max(
			deepest,
			c.depth + c.radius,
			c.depthKnown ? 0 : UNKNOWN_DEPTH_BAND[1],
		);
	for (const r of rects) deepest = Math.max(deepest, r.bottom);
	for (const l of along) deepest = Math.max(deepest, l.depth0, l.depth1);

	return {
		frame,
		circles,
		rects,
		along,
		streets,
		maxDepth: Math.max(MIN_SECTION_DEPTH_M, deepest + DEPTH_PADDING_M),
	};
}

// ── snapping to a clash ────────────────────────────────────────────────────

/** Tangent of the polyline segment nearest to p (2D), or null. */
function tangentNear(path: (Point2 | Point3)[], p: Point2): Point2 | null {
	let best: Point2 | null = null;
	let bestDist = Infinity;
	for (let i = 0; i < path.length - 1; i++) {
		const a = xy(path[i]);
		const b = xy(path[i + 1]);
		const ab = sub(b, a);
		const len2 = dot(ab, ab);
		if (len2 < 1e-12) continue;
		const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
		const dist = Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
		if (dist < bestDist) {
			bestDist = dist;
			best = unit(ab);
		}
	}
	return best;
}

/** [min, max] of a set of plan points projected onto `normal`, relative to `anchor`. */
function extentAlong(
	points: (Point2 | Point3)[],
	anchor: Point2,
	normal: Point2,
): [number, number] {
	let lo = Infinity;
	let hi = -Infinity;
	for (const p of points) {
		const d = dot(sub(xy(p), anchor), normal);
		lo = Math.min(lo, d);
		hi = Math.max(hi, d);
	}
	return [lo, hi];
}

/** The plan path used to orient a cut through a work. */
function workPlanPath(w: Work): (Point2 | Point3)[] {
	if (w.work_type === "HDD" && w.bore_path) return w.bore_path;
	return w.path;
}

/**
 * Section through a clash. Candidate viewing directions, in order: along the
 * work at the clash (so a trench is cut square and shows as a rectangle), then
 * along the asset. The first candidate where no line element (asset, bore,
 * new pipe) runs along the plane wins. The plane is then kept at least 0.5 m
 * inside the ends of the elements it cuts, so it never lands on a pipe end.
 */
export function snapSectionToClash(
	scene: Scene,
	clash: Clash,
): SectionState | null {
	const loc: Point2 = [clash.location.x, clash.location.y];
	const works = clash.work_ids
		.map((id) => scene.works.find((w) => w.id === id))
		.filter((w): w is Work => w !== undefined);
	const assets = clash.asset_ids
		.map((id) => scene.assets.find((a) => a.id === id))
		.filter((a): a is Asset => a !== undefined);

	const lines: (Point2 | Point3)[][] = [
		...assets.map((a) => a.path),
		...works.filter((w) => workLine(w) !== null).map(workPlanPath),
	];

	const candidates: Point2[] = [];
	for (const w of works) {
		const t = tangentNear(workPlanPath(w), loc);
		if (t) candidates.push(t);
	}
	for (const a of assets) {
		const t = tangentNear(a.path, loc);
		if (t) candidates.push(t);
	}
	if (candidates.length === 0) candidates.push([1, 0]);

	const crossesAll = (n: Point2) =>
		lines.every((path) => {
			const t = tangentNear(path, loc);
			return t !== null && Math.abs(dot(t, n)) >= ALONG_COS;
		});
	const normal = candidates.find(crossesAll) ?? candidates[0];

	// Keep the plane inside every element it is meant to cut.
	let lo = -Infinity;
	let hi = Infinity;
	const extents: (Point2 | Point3)[][] = [
		...assets.map((a) => a.path),
		...works.map((w) => workPolygons(w).flat()),
		...works.filter((w) => workLine(w) !== null).map(workPlanPath),
	];
	for (const pts of extents) {
		if (pts.length === 0) continue;
		const [a, b] = extentAlong(pts, loc, normal);
		lo = Math.max(lo, a);
		hi = Math.min(hi, b);
	}
	let offset = 0;
	if (Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi) {
		if (hi - lo < END_MARGIN_M * 4) offset = (lo + hi) / 2;
		else offset = Math.min(Math.max(0, lo + END_MARGIN_M), hi - END_MARGIN_M);
	}

	return {
		anchor: loc,
		normal,
		halfWidth: CLASH_HALF_WIDTH_M,
		offset,
		source: { kind: "clash", clashId: clash.id },
	};
}

// ── dimension line for the selected clash ──────────────────────────────────

export interface Dimension {
	/** [u, depth] endpoints. */
	from: Point2;
	to: Point2;
	/** Surface-to-surface gap as drawn in this cut (negative = overlap). */
	drawnGap: number;
	assetCircle: CutCircle;
	workShape:
		| { kind: "rect"; rect: CutRect }
		| { kind: "circle"; circle: CutCircle };
}

function circleVsRect(
	c: CutCircle,
	r: CutRect,
): Omit<Dimension, "assetCircle" | "workShape"> {
	// SPEC §8.2: asset passing under / through the footprint → vertical gap.
	if (c.u >= r.u0 - c.radius && c.u <= r.u1 + c.radius) {
		const assetTop = c.depth - c.radius;
		const u = Math.min(Math.max(c.u, r.u0), r.u1);
		if (c.depth + c.radius < r.top) {
			// Asset wholly above the excavation band.
			const gap = r.top - (c.depth + c.radius);
			return { from: [u, c.depth + c.radius], to: [u, r.top], drawnGap: gap };
		}
		return {
			from: [u, r.bottom],
			to: [u, assetTop],
			drawnGap: assetTop - r.bottom,
		};
	}
	const px = Math.min(Math.max(c.u, r.u0), r.u1);
	const py = Math.min(Math.max(c.depth, r.top), r.bottom);
	const dx = c.u - px;
	const dy = c.depth - py;
	const dist = Math.hypot(dx, dy) || 1e-9;
	return {
		from: [px, py],
		to: [c.u - (dx / dist) * c.radius, c.depth - (dy / dist) * c.radius],
		drawnGap: dist - c.radius,
	};
}

function circleVsCircle(
	a: CutCircle,
	b: CutCircle,
): Omit<Dimension, "assetCircle" | "workShape"> {
	const dx = a.u - b.u;
	const dy = a.depth - b.depth;
	const dist = Math.hypot(dx, dy) || 1e-9;
	const ux = dx / dist;
	const uy = dy / dist;
	return {
		from: [b.u + ux * b.radius, b.depth + uy * b.radius],
		to: [a.u - ux * a.radius, a.depth - uy * a.radius],
		drawnGap: dist - a.radius - b.radius,
	};
}

/**
 * Dimension between the clash's asset and work as they appear in this cut.
 * Null when either is missing from the cut, or the asset depth is unknown
 * (a gap is never invented).
 */
export function dimensionFor(cut: SectionCut, clash: Clash): Dimension | null {
	const assetId = clash.asset_ids[0];
	const workId = clash.work_ids[0];
	if (!assetId || !workId) return null;
	const assetCircles = cut.circles.filter(
		(c) => c.owner === "asset" && c.id === assetId && c.depthKnown,
	);
	const workRects = cut.rects.filter((r) => r.workId === workId);
	const workCircles = cut.circles.filter(
		(c) => c.owner === "work" && c.id === workId,
	);

	let best: Dimension | null = null;
	for (const ac of assetCircles) {
		// Bores and new pipes are measured as pipes (3D distance); a PIPE_LAY
		// trench is only drawn, never measured.
		const options: Dimension[] =
			workCircles.length > 0
				? workCircles.map((wc) => ({
						...circleVsCircle(ac, wc),
						assetCircle: ac,
						workShape: { kind: "circle", circle: wc } as const,
					}))
				: workRects.map((r) => ({
						...circleVsRect(ac, r),
						assetCircle: ac,
						workShape: { kind: "rect", rect: r } as const,
					}));
		// The engine reports the worst (smallest) gap; draw the same one.
		for (const o of options) if (!best || o.drawnGap < best.drawnGap) best = o;
	}
	return best;
}

/** Whether the clash's work and asset (if any) appear in the cut at all. */
export function clashPresence(
	cut: SectionCut,
	clash: Clash,
): { work: boolean; asset: boolean } {
	const workId = clash.work_ids[0];
	const assetId = clash.asset_ids[0];
	const inCut = (id: string | undefined, owner: "asset" | "work") =>
		id !== undefined &&
		(cut.circles.some((c) => c.id === id && c.owner === owner) ||
			cut.along.some((l) => l.id === id && l.owner === owner) ||
			(owner === "work" && cut.rects.some((r) => r.workId === id)));
	return {
		work: inCut(workId, "work"),
		asset: assetId === undefined ? true : inCut(assetId, "asset"),
	};
}
