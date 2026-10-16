// Low-poly city context generated from /api/scene (SPEC §10.2, street level).
// Pure and deterministic: same scene in → same instances out (seeded PRNG,
// no Math.random). Everything is in scene coordinates (x east, y north,
// z up, metres); CityContext converts through lib/coords.

import type {
	Bounds,
	Junction,
	Landmark,
	Point2,
	Point3,
	Street,
	Work,
} from "@/api/types";
import { CITY_COLORS } from "@/lib/colors";

/** Primitive shapes; each kind is one instanced mesh per material group. */
export type PrimShape = "box" | "cylinder" | "pyramid" | "blob";

/**
 * One instance. (x, y, z) is the centre of its base; sx runs along `yaw`
 * (scene heading, radians from +x), sz across it, sy is the height.
 */
export interface Prim {
	x: number;
	y: number;
	z: number;
	sx: number;
	sy: number;
	sz: number;
	yaw: number;
	color: string;
}

/** Material groups fade separately: the ground layer and what stands on it. */
export interface CityLayout {
	ground: Record<"box", Prim[]>;
	built: Record<PrimShape, Prim[]>;
}

export interface CityInput {
	bounds: Bounds;
	streets: readonly Street[];
	landmarks: readonly Landmark[];
	works: readonly Work[];
	/** Clash marker locations; lots keep clear of them. */
	clashPoints: readonly Point2[];
}

export const CITY = {
	seed: 7,
	footpathWidth: 2.5,
	footpathHeight: 0.15,
	roadThickness: 0.012,
	/** Sampling step when clipping footpaths at junctions (m). */
	clipStep: 1,
	dashLength: 3,
	dashGap: 3,
	dashWidth: 0.15,
	dashThickness: 0.02,
	lampSpacing: 30,
	lampHeight: 6,
	treeTrunkHeight: 2.2,
	treeCrown: 3.2,
	/** Building lots. */
	lotStep: 24,
	lotMin: 10,
	lotMax: 18,
	lotMinShrunk: 6,
	setback: 3,
	landmarkClear: 15,
	/** Clearance from work footprints and clash markers (amendment 5). */
	worksClear: 5,
	clashClear: 5,
	emptyLotChance: 0.12,
	heightMin: 6,
	heightRange: 24,
	boundsMargin: 2,
} as const;

// --- PRNG ------------------------------------------------------------------

/** mulberry32: tiny, fast, deterministic. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// --- 2D geometry -----------------------------------------------------------

interface Seg {
	a: Point2;
	b: Point2;
}

interface Rect {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export function distPointSegment(p: Point2, a: Point2, b: Point2): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const len2 = dx * dx + dy * dy;
	const t =
		len2 === 0
			? 0
			: Math.max(
					0,
					Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2),
				);
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function distPointRect(p: Point2, r: Rect): number {
	const dx = Math.max(r.minX - p[0], 0, p[0] - r.maxX);
	const dy = Math.max(r.minY - p[1], 0, p[1] - r.maxY);
	return Math.hypot(dx, dy);
}

function cross(o: Point2, a: Point2, b: Point2): number {
	return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsIntersect(p: Seg, q: Seg): boolean {
	const d1 = cross(q.a, q.b, p.a);
	const d2 = cross(q.a, q.b, p.b);
	const d3 = cross(p.a, p.b, q.a);
	const d4 = cross(p.a, p.b, q.b);
	return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Exact distance between a segment and an axis-aligned rectangle. */
export function distSegmentRect(a: Point2, b: Point2, r: Rect): number {
	if (distPointRect(a, r) === 0 || distPointRect(b, r) === 0) return 0;
	const corners: Point2[] = [
		[r.minX, r.minY],
		[r.maxX, r.minY],
		[r.maxX, r.maxY],
		[r.minX, r.maxY],
	];
	const seg = { a, b };
	for (let i = 0; i < 4; i++) {
		if (segmentsIntersect(seg, { a: corners[i], b: corners[(i + 1) % 4] }))
			return 0;
	}
	let best = Math.min(distPointRect(a, r), distPointRect(b, r));
	for (const c of corners) best = Math.min(best, distPointSegment(c, a, b));
	return best;
}

function segmentsOf(path: readonly (Point2 | Point3)[]): Seg[] {
	const out: Seg[] = [];
	if (path.length === 1) {
		const p: Point2 = [path[0][0], path[0][1]];
		out.push({ a: p, b: p });
	}
	for (let i = 0; i + 1 < path.length; i++) {
		out.push({
			a: [path[i][0], path[i][1]],
			b: [path[i + 1][0], path[i + 1][1]],
		});
	}
	return out;
}

/** Point `s` metres along a polyline (clamped to its ends) and its heading. */
export function alongPolyline(
	line: readonly Point2[],
	s: number,
): { point: Point2; heading: number } {
	let left = Math.max(0, s);
	for (let i = 0; i + 1 < line.length; i++) {
		const [ax, ay] = line[i];
		const [bx, by] = line[i + 1];
		const len = Math.hypot(bx - ax, by - ay);
		const heading = Math.atan2(by - ay, bx - ax);
		if (left <= len || i + 2 === line.length) {
			const t = len === 0 ? 0 : Math.min(left, len) / len;
			return { point: [ax + (bx - ax) * t, ay + (by - ay) * t], heading };
		}
		left -= len;
	}
	return { point: line[0] ?? [0, 0], heading: 0 };
}

export function polylineLength(line: readonly Point2[]): number {
	let total = 0;
	for (let i = 0; i + 1 < line.length; i++)
		total += Math.hypot(
			line[i + 1][0] - line[i][0],
			line[i + 1][1] - line[i][1],
		);
	return total;
}

/** Distance along the polyline of the point on it closest to `p`. */
function projectAlong(
	line: readonly Point2[],
	p: Point2,
): { s: number; dist: number } {
	let best = { s: 0, dist: Number.POSITIVE_INFINITY };
	let acc = 0;
	for (let i = 0; i + 1 < line.length; i++) {
		const a = line[i];
		const b = line[i + 1];
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const len = Math.hypot(dx, dy);
		const t =
			len === 0
				? 0
				: Math.max(
						0,
						Math.min(
							1,
							((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (len * len),
						),
					);
		const dist = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
		if (dist < best.dist) best = { s: acc + t * len, dist };
		acc += len;
	}
	return best;
}

// --- Streets ---------------------------------------------------------------

interface StreetSegs {
	street: Street;
	half: number;
	segs: Seg[];
}

function streetSegs(streets: readonly Street[]): StreetSegs[] {
	return streets.map((street) => ({
		street,
		half: street.width_m / 2,
		segs: segmentsOf(street.centerline),
	}));
}

/** Inside another street's road (+ `extra` beyond its kerb)? */
function inOtherStreet(
	p: Point2,
	all: readonly StreetSegs[],
	exceptId: string,
	extra: number,
): boolean {
	for (const s of all) {
		if (s.street.id === exceptId) continue;
		for (const seg of s.segs) {
			if (distPointSegment(p, seg.a, seg.b) < s.half + extra) return true;
		}
	}
	return false;
}

function near(p: Point2, points: readonly Point2[], radius: number): boolean {
	return points.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < radius);
}

/**
 * Splits a strip running along `seg` (offset sideways by `offset`) into the
 * runs that stay out of every other street's band, as boxes.
 */
function clippedRuns(
	seg: Seg,
	offset: number,
	keep: (p: Point2) => boolean,
	make: (from: number, to: number) => Prim,
): Prim[] {
	const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
	if (len === 0) return [];
	const ux = (seg.b[0] - seg.a[0]) / len;
	const uy = (seg.b[1] - seg.a[1]) / len;
	const at = (t: number): Point2 => [
		seg.a[0] + ux * t - uy * offset,
		seg.a[1] + uy * t + ux * offset,
	];
	const out: Prim[] = [];
	let start: number | null = null;
	const step = CITY.clipStep;
	for (let t = 0; t <= len + 1e-9; t += step) {
		const ok = keep(at(Math.min(t, len)));
		if (ok && start === null) start = t;
		if (!ok && start !== null) {
			if (t - step - start > 0.5) out.push(make(start, t - step));
			start = null;
		}
	}
	if (start !== null && len - start > 0.5) out.push(make(start, len));
	return out;
}

/** Box along a segment between distances `from` and `to`, offset sideways. */
function stripBox(
	seg: Seg,
	from: number,
	to: number,
	offset: number,
	width: number,
	z: number,
	height: number,
	color: string,
): Prim {
	const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
	const ux = (seg.b[0] - seg.a[0]) / len;
	const uy = (seg.b[1] - seg.a[1]) / len;
	const mid = (from + to) / 2;
	return {
		x: seg.a[0] + ux * mid - uy * offset,
		y: seg.a[1] + uy * mid + ux * offset,
		z,
		sx: to - from,
		sy: height,
		sz: width,
		yaw: Math.atan2(uy, ux),
		color,
	};
}

// --- Landmarks -------------------------------------------------------------

type LandmarkKind = "tank" | "school" | "depot" | "hall" | "gate";
const LANDMARK_ORDER: LandmarkKind[] = [
	"school",
	"depot",
	"tank",
	"hall",
	"gate",
];

export function landmarkKind(name: string, index: number): LandmarkKind {
	const n = name.toLowerCase();
	if (n.includes("tank")) return "tank";
	if (n.includes("school") || n.includes("college")) return "school";
	if (n.includes("depot") || n.includes("station") || n.includes("yard"))
		return "depot";
	if (n.includes("hall") || n.includes("temple") || n.includes("centre"))
		return "hall";
	if (n.includes("gate") || n.includes("park")) return "gate";
	return LANDMARK_ORDER[index % LANDMARK_ORDER.length];
}

/** Footprint (x × y) each landmark shape needs, used to push it off roads. */
const LANDMARK_SIZE: Record<LandmarkKind, [number, number]> = {
	tank: [9, 9],
	school: [30, 12],
	depot: [22, 14],
	hall: [18, 14],
	gate: [10, 2],
};

/**
 * Moves a landmark footprint centred at `p` out of every street band (road +
 * footpath + 1 m), pushing along each street's normal. The label stays at the
 * landmark's own point; only the shape moves.
 */
function clearOfStreets(
	p: Point2,
	size: [number, number],
	all: readonly StreetSegs[],
): Point2 {
	let [x, y] = p;
	for (let iter = 0; iter < 6; iter++) {
		let moved = false;
		for (const s of all) {
			const need = s.half + CITY.footpathWidth + 1;
			for (const seg of s.segs) {
				const rect = {
					minX: x - size[0] / 2,
					maxX: x + size[0] / 2,
					minY: y - size[1] / 2,
					maxY: y + size[1] / 2,
				};
				const d = distSegmentRect(seg.a, seg.b, rect);
				if (d >= need) continue;
				const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
				if (len === 0) continue;
				// Unit normal pointing from the street towards the landmark.
				let nx = -(seg.b[1] - seg.a[1]) / len;
				let ny = (seg.b[0] - seg.a[0]) / len;
				if ((x - seg.a[0]) * nx + (y - seg.a[1]) * ny < 0) {
					nx = -nx;
					ny = -ny;
				}
				// Half the footprint's extent along that normal.
				const reach =
					(Math.abs(nx) * size[0]) / 2 + (Math.abs(ny) * size[1]) / 2;
				const centreDist = distPointSegment([x, y], seg.a, seg.b);
				const shift = need + reach - centreDist + 0.01;
				if (shift > 0) {
					x += nx * shift;
					y += ny * shift;
					moved = true;
				}
			}
		}
		if (!moved) break;
	}
	return [x, y];
}

function landmarkPrims(
	kind: LandmarkKind,
	[x, y]: Point2,
): Partial<Record<PrimShape, Prim[]>> {
	const body = CITY_COLORS.landmark;
	const accent = CITY_COLORS.landmarkAccent;
	const box = (
		dx: number,
		dy: number,
		z: number,
		sx: number,
		sy: number,
		sz: number,
		color: string = body,
	): Prim => ({ x: x + dx, y: y + dy, z, sx, sy, sz, yaw: 0, color });
	switch (kind) {
		case "tank":
			return {
				cylinder: [
					{ x, y, z: 0, sx: 1.6, sy: 10, sz: 1.6, yaw: 0, color: accent },
					{ x, y, z: 10, sx: 9, sy: 4.5, sz: 9, yaw: 0, color: body },
				],
				pyramid: [
					{ x, y, z: 14.5, sx: 9, sy: 1.5, sz: 9, yaw: 0, color: accent },
				],
			};
		case "school":
			return {
				box: [
					box(0, 0, 0, 30, 7, 12),
					box(0, 0, 7, 30.6, 0.4, 12.6, accent),
					box(-17, 0, 0, 0.2, 9, 0.2, accent),
				],
			};
		case "depot":
			return {
				box: [box(0, 0, 0, 22, 6, 14), box(0, 0, 6, 22.8, 0.5, 14.8, accent)],
			};
		case "hall":
			return {
				box: [box(0, 0, 0, 18, 8, 14)],
				pyramid: [{ x, y, z: 8, sx: 19, sy: 4, sz: 15, yaw: 0, color: accent }],
			};
		case "gate":
			return {
				box: [
					box(-4, 0, 0, 1.2, 4.5, 1.2, accent),
					box(4, 0, 0, 1.2, 4.5, 1.2, accent),
					box(0, 0, 4.5, 10, 0.8, 1.4),
				],
			};
	}
}

// --- Layout ----------------------------------------------------------------

export function buildCityLayout(input: CityInput): CityLayout {
	const { bounds, streets, landmarks, works, clashPoints } = input;
	const rng = mulberry32(CITY.seed);
	const all = streetSegs(streets);
	const ground: CityLayout["ground"] = { box: [] };
	const built: CityLayout["built"] = {
		box: [],
		cylinder: [],
		pyramid: [],
		blob: [],
	};
	const landmarkPoints: Point2[] = landmarks.map((l) => [l.x, l.y]);
	const fw = CITY.footpathWidth;

	for (const s of all) {
		const id = s.street.id;
		for (const seg of s.segs) {
			const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
			if (len === 0) continue;

			// Road slab: one box per centreline segment.
			ground.box.push(
				stripBox(
					seg,
					0,
					len,
					0,
					s.street.width_m,
					0,
					CITY.roadThickness,
					CITY_COLORS.road,
				),
			);

			// Footpaths both sides, clipped where they cross another street.
			for (const side of [1, -1]) {
				const offset = side * (s.half + fw / 2);
				ground.box.push(
					...clippedRuns(
						seg,
						offset,
						(p) => !inOtherStreet(p, all, id, fw),
						(from, to) =>
							stripBox(
								seg,
								from,
								to,
								offset,
								fw,
								0,
								CITY.footpathHeight,
								CITY_COLORS.footpath,
							),
					),
				);
			}

			// Dashed centre line, skipped inside junctions.
			const period = CITY.dashLength + CITY.dashGap;
			for (let t = CITY.dashGap; t + CITY.dashLength <= len; t += period) {
				const from = stripBox(seg, t, t + CITY.dashLength, 0, 0, 0, 0, "");
				if (inOtherStreet([from.x, from.y], all, id, 1)) continue;
				ground.box.push(
					stripBox(
						seg,
						t,
						t + CITY.dashLength,
						0,
						CITY.dashWidth,
						CITY.roadThickness,
						CITY.dashThickness,
						CITY_COLORS.laneMarking,
					),
				);
			}

			// Lamps every lampSpacing m, alternating sides; trees halfway between,
			// on the opposite side.
			let k = 0;
			for (
				let t = CITY.lampSpacing / 2;
				t < len;
				t += CITY.lampSpacing / 2, k++
			) {
				const isLamp = k % 2 === 0;
				const side = (Math.floor(k / 2) % 2 === 0 ? 1 : -1) * (isLamp ? 1 : -1);
				const offset = side * (s.half + (isLamp ? 0.6 : fw - 0.8));
				const at = stripBox(seg, t, t, offset, 0, 0, 0, "");
				const p: Point2 = [at.x, at.y];
				if (inOtherStreet(p, all, id, fw + 2)) continue;
				if (near(p, landmarkPoints, 10)) continue;
				if (isLamp) {
					built.cylinder.push({
						x: p[0],
						y: p[1],
						z: CITY.footpathHeight,
						sx: 0.16,
						sy: CITY.lampHeight,
						sz: 0.16,
						yaw: 0,
						color: CITY_COLORS.lampPole,
					});
					built.box.push({
						x: p[0],
						y: p[1],
						z: CITY.footpathHeight + CITY.lampHeight,
						sx: 0.6,
						sy: 0.2,
						sz: 0.6,
						yaw: at.yaw,
						color: CITY_COLORS.lampHead,
					});
				} else {
					built.cylinder.push({
						x: p[0],
						y: p[1],
						z: CITY.footpathHeight,
						sx: 0.3,
						sy: CITY.treeTrunkHeight,
						sz: 0.3,
						yaw: 0,
						color: CITY_COLORS.trunk,
					});
					const crown = CITY.treeCrown * (0.8 + rng() * 0.4);
					built.blob.push({
						x: p[0],
						y: p[1],
						z: CITY.footpathHeight + CITY.treeTrunkHeight - 0.4,
						sx: crown,
						sy: crown,
						sz: crown,
						yaw: rng() * Math.PI,
						color: CITY_COLORS.crown,
					});
				}
			}
		}
	}

	// Landmarks: distinct simple shapes, pushed clear of the roads.
	landmarks.forEach((l, i) => {
		const kind = landmarkKind(l.name, i);
		const at = clearOfStreets([l.x, l.y], LANDMARK_SIZE[kind], all);
		const prims = landmarkPrims(kind, at);
		for (const shape of Object.keys(prims) as PrimShape[])
			built[shape].push(...(prims[shape] ?? []));
	});

	// Building lots on a jittered grid; shrink a lot before giving up on it.
	const workSegs = works.flatMap((w) => {
		const half = Math.max(w.width_m, w.bore_diameter_m ?? 0) / 2;
		return [
			...segmentsOf(w.path),
			...(w.bore_path ? segmentsOf(w.bore_path) : []),
		].map((seg) => ({ seg, half }));
	});
	const lotClear = (r: Rect): boolean => {
		const m = CITY.boundsMargin;
		if (
			r.minX < bounds.min_x + m ||
			r.maxX > bounds.max_x - m ||
			r.minY < bounds.min_y + m ||
			r.maxY > bounds.max_y - m
		)
			return false;
		for (const s of all) {
			const need = s.half + fw + CITY.setback;
			for (const seg of s.segs)
				if (distSegmentRect(seg.a, seg.b, r) < need) return false;
		}
		for (const { seg, half } of workSegs)
			if (distSegmentRect(seg.a, seg.b, r) < half + CITY.worksClear)
				return false;
		for (const p of landmarkPoints)
			if (distPointRect(p, r) < CITY.landmarkClear) return false;
		for (const p of clashPoints)
			if (distPointRect(p, r) < CITY.clashClear) return false;
		return true;
	};

	const step = CITY.lotStep;
	for (let cx = bounds.min_x + step / 2; cx < bounds.max_x; cx += step) {
		for (let cy = bounds.min_y + step / 2; cy < bounds.max_y; cy += step) {
			// Draw every random number up front so one lot's outcome never
			// shifts the next lot's layout.
			const w = CITY.lotMin + rng() * (CITY.lotMax - CITY.lotMin);
			const d = CITY.lotMin + rng() * (CITY.lotMax - CITY.lotMin);
			const jx = (rng() - 0.5) * 6;
			const jy = (rng() - 0.5) * 6;
			const h = CITY.heightMin + rng() ** 2 * CITY.heightRange;
			const colorIndex = Math.floor(rng() * CITY_COLORS.buildings.length);
			const empty = rng() < CITY.emptyLotChance;
			if (empty) continue;
			for (const f of [1, 0.7, 0.5]) {
				const fw2 = Math.max((w * f) / 2, CITY.lotMinShrunk / 2);
				const fd2 = Math.max((d * f) / 2, CITY.lotMinShrunk / 2);
				const x = cx + jx;
				const y = cy + jy;
				const rect = {
					minX: x - fw2,
					maxX: x + fw2,
					minY: y - fd2,
					maxY: y + fd2,
				};
				if (!lotClear(rect)) continue;
				built.box.push({
					x,
					y,
					z: 0,
					sx: fw2 * 2,
					sy: h,
					sz: fd2 * 2,
					yaw: 0,
					color: CITY_COLORS.buildings[colorIndex],
				});
				break;
			}
		}
	}

	return { ground, built };
}

// --- Street-level camera ---------------------------------------------------

export const STREET_VIEW = {
	eyeHeight: 1.7,
	/** Eye this far before the first junction on the street, target on it. */
	lookAhead: 30,
	/** Junctions closer than this to the street start are skipped. */
	minStart: 40,
	/** Fallback when the street has no junction: eye at this fraction. */
	fallbackFraction: 0.25,
} as const;

export interface StreetPose {
	eye: Point3;
	target: Point3;
}

/**
 * Eye 1.7 m up on the centreline, `lookAhead` m before the first junction that
 * lies on the street, looking along it at the junction's road surface (so
 * pipes underfoot are in view once x-ray is on). Station Road (seed): eye
 * (150, 200, 1.7) → target J3 (180, 200, 0).
 */
export function streetViewPose(
	street: Street,
	junctions: readonly Junction[],
): StreetPose {
	const line = street.centerline;
	const length = polylineLength(line);
	const onStreet = junctions
		.map((j) => projectAlong(line, [j.x, j.y]))
		.filter(
			(p) => p.dist <= street.width_m / 2 + 1 && p.s >= STREET_VIEW.minStart,
		)
		.sort((a, b) => a.s - b.s);
	const targetS =
		onStreet.length > 0
			? onStreet[0].s
			: Math.min(
					length,
					length * STREET_VIEW.fallbackFraction + STREET_VIEW.lookAhead,
				);
	const eyeS = Math.max(0, targetS - STREET_VIEW.lookAhead);
	const eye = alongPolyline(line, eyeS).point;
	const target = alongPolyline(line, targetS).point;
	return {
		eye: [eye[0], eye[1], STREET_VIEW.eyeHeight],
		target: [target[0], target[1], 0],
	};
}

/** Default street for the street-level view (amendment: Station Road). */
export function defaultStreetId(streets: readonly Street[]): string | null {
	const station = streets.find((s) => /station road/i.test(s.name));
	return station?.id ?? streets[0]?.id ?? null;
}
