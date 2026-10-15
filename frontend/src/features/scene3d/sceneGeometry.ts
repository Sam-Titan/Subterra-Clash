// Pure geometry builders for the 3D scene. Every scene → Three.js conversion
// goes through src/lib/coords.ts (SPEC §6); nothing here knows the axis order.
//
// Work shapes follow SPEC §8.1 / §8.2:
//   TRENCH   = boxes along `path`, width_m wide, depth_from_m → depth_to_m
//   PIT      = the `path` polygon ring, extruded over the depth band
//   HDD      = tube along `bore_path`, radius bore_diameter_m / 2
//   PIPE_LAY = tube along `path` at depth depth_to_m − bore_diameter_m / 2,
//              plus the trench it is laid in

import {
	BoxGeometry,
	type BufferGeometry,
	CurvePath,
	ExtrudeGeometry,
	LineCurve3,
	Matrix4,
	Quaternion,
	Shape,
	TubeGeometry,
	Vector2,
	Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Point2, Point3, Work } from "@/api/types";
import {
	headingToThreeYaw,
	PLAN_TO_THREE_ROTATION_X,
	toThree,
	type Vec3,
} from "@/lib/coords";

const TUBE_RADIAL_SEGMENTS = 10;
/** Tube samples per metre of path; straight runs need few. */
const TUBE_SAMPLES_PER_M = 0.25;
/** Never draw a volume thinner than this, so a zero-height band is still visible. */
const MIN_VOLUME_HEIGHT_M = 0.05;

/** Straight-segment curve through scene points (no smoothing at vertices). */
function polylineCurve(points: Point3[]): CurvePath<Vector3> {
	const curve = new CurvePath<Vector3>();
	for (let i = 0; i < points.length - 1; i++) {
		curve.add(
			new LineCurve3(
				new Vector3(...toThree(points[i])),
				new Vector3(...toThree(points[i + 1])),
			),
		);
	}
	return curve;
}

/** Tube along a scene polyline. Returns null for paths with fewer than 2 points. */
export function polylineTube(
	points: Point3[],
	radius: number,
): TubeGeometry | null {
	if (points.length < 2 || radius <= 0) return null;
	const curve = polylineCurve(points);
	const length = curve.getLength();
	if (length <= 0) return null;
	// Enough samples that every vertex sits close to a sample (corners stay sharp).
	const segments = Math.max(
		(points.length - 1) * 2,
		Math.ceil(length * TUBE_SAMPLES_PER_M),
	);
	return new TubeGeometry(curve, segments, radius, TUBE_RADIAL_SEGMENTS, false);
}

/** Merge geometries into one (fewer draw calls). Disposes the inputs. */
export function mergeAll(
	geometries: (BufferGeometry | null)[],
): BufferGeometry | null {
	const parts = geometries.filter((g): g is BufferGeometry => g !== null);
	if (parts.length === 0) return null;
	// Tubes are indexed and boxes/extrusions vary; normalise to non-indexed
	// position + normal so mergeGeometries accepts any mix.
	const flat = parts.map((g) => {
		const nonIndexed = g.index ? g.toNonIndexed() : g;
		for (const name of Object.keys(nonIndexed.attributes)) {
			if (name !== "position" && name !== "normal")
				nonIndexed.deleteAttribute(name);
		}
		return nonIndexed;
	});
	const merged = mergeGeometries(flat, false);
	for (const g of new Set([...parts, ...flat])) g.dispose();
	return merged;
}

/** Offset a 2D polyline sideways (positive = left of travel). Mitred joints. */
export function offsetPolyline2D(points: Point2[], offset: number): Point2[] {
	if (points.length < 2) return points;
	const normals: Point2[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const dx = points[i + 1][0] - points[i][0];
		const dy = points[i + 1][1] - points[i][1];
		const len = Math.hypot(dx, dy) || 1;
		normals.push([-dy / len, dx / len]);
	}
	return points.map((p, i) => {
		const a = normals[Math.max(0, i - 1)];
		const b = normals[Math.min(normals.length - 1, i)];
		let nx = a[0] + b[0];
		let ny = a[1] + b[1];
		const nLen = Math.hypot(nx, ny) || 1;
		nx /= nLen;
		ny /= nLen;
		// Lengthen at corners so both edges stay `offset` away; cap sharp spikes.
		const cos = Math.max(0.25, nx * b[0] + ny * b[1]);
		return [p[0] + (nx * offset) / cos, p[1] + (ny * offset) / cos];
	});
}

/** Point halfway along a 2D polyline (for labels). */
export function polylineMidpoint(points: Point2[]): Point2 {
	if (points.length === 1) return points[0];
	const lengths = points
		.slice(1)
		.map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
	let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
	for (let i = 0; i < lengths.length; i++) {
		if (remaining <= lengths[i]) {
			const t = lengths[i] === 0 ? 0 : remaining / lengths[i];
			return [
				points[i][0] + (points[i + 1][0] - points[i][0]) * t,
				points[i][1] + (points[i + 1][1] - points[i][1]) * t,
			];
		}
		remaining -= lengths[i];
	}
	return points[points.length - 1];
}

/** Consecutive pairs of a polyline, flattened for LineSegments ([a,b,b,c,…]). */
export function polylineToSegments(points: Vec3[]): Vec3[] {
	const out: Vec3[] = [];
	for (let i = 0; i < points.length - 1; i++)
		out.push(points[i], points[i + 1]);
	return out;
}

function band(work: Work): { top: number; height: number } {
	const height = Math.max(
		MIN_VOLUME_HEIGHT_M,
		work.depth_to_m - work.depth_from_m,
	);
	return { top: -work.depth_from_m, height };
}

/** TRENCH (and PIPE_LAY trench): one box per path segment over the depth band. */
export function trenchGeometry(work: Work): BufferGeometry | null {
	const { top, height } = band(work);
	const boxes: BufferGeometry[] = [];
	const up = new Vector3(0, 1, 0);
	for (let i = 0; i < work.path.length - 1; i++) {
		const [x1, y1] = work.path[i];
		const [x2, y2] = work.path[i + 1];
		const length = Math.hypot(x2 - x1, y2 - y1);
		if (length === 0) continue;
		const box = new BoxGeometry(length, height, Math.max(work.width_m, 0.05));
		const centre = toThree([(x1 + x2) / 2, (y1 + y2) / 2, top - height / 2]);
		box.applyMatrix4(
			new Matrix4().compose(
				new Vector3(...centre),
				new Quaternion().setFromAxisAngle(
					up,
					headingToThreeYaw(x2 - x1, y2 - y1),
				),
				new Vector3(1, 1, 1),
			),
		);
		boxes.push(box);
	}
	return mergeAll(boxes);
}

/** PIT: the polygon ring extruded down over the depth band. */
export function pitGeometry(work: Work): BufferGeometry | null {
	const ring = [...work.path];
	if (ring.length > 1) {
		const [first, last] = [ring[0], ring[ring.length - 1]];
		if (first[0] === last[0] && first[1] === last[1]) ring.pop();
	}
	if (ring.length < 3) return null;
	const { top, height } = band(work);
	const shape = new Shape(ring.map(([x, y]) => new Vector2(x, y)));
	const geometry = new ExtrudeGeometry(shape, {
		depth: height,
		bevelEnabled: false,
	});
	// Built in the scene plan (x, y) with extrusion along +z (up), so the pit
	// spans z ∈ [0, height]; shift down so its top sits at −depth_from.
	geometry.translate(0, 0, top - height);
	geometry.rotateX(PLAN_TO_THREE_ROTATION_X);
	return geometry;
}

/** HDD: tube along the 3D bore path. Null when bore geometry is missing. */
export function hddGeometry(work: Work): BufferGeometry | null {
	if (!work.bore_path || work.bore_diameter_m === null) return null;
	return polylineTube(work.bore_path, work.bore_diameter_m / 2);
}

/** PIPE_LAY: the new pipe's centreline is `path` at depth_to − d/2 (SPEC §8.2). */
export function pipeLayGeometry(work: Work): BufferGeometry | null {
	if (work.bore_diameter_m === null) return null;
	const r = work.bore_diameter_m / 2;
	const z = -(work.depth_to_m - r);
	return polylineTube(
		work.path.map(([x, y]) => [x, y, z] as Point3),
		r,
	);
}
