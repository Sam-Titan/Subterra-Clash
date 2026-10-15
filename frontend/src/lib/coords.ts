// The only place that converts between scene coordinates and Three.js (SPEC §6).
//
// Scene frame: x = east (m), y = north (m), z = elevation relative to the road
// surface (m), so underground is negative. Origin = south-west corner.
// Three.js frame (Y up): X = x, Y = z, Z = −y.

import type { Bounds, Point2, Point3 } from "@/api/types";

export type Vec3 = [number, number, number];

/** Scene [x, y] or [x, y, z] → Three.js [X, Y, Z]. Missing z = road surface. */
export function toThree(point: Point2 | Point3): Vec3 {
	const z = point.length === 3 ? point[2] : 0;
	return [point[0], z, -point[1]];
}

/** Three.js [X, Y, Z] → scene [x, y, z]. */
export function fromThree([X, Y, Z]: Vec3): Point3 {
	return [X, -Z, Y];
}

/** Scene polyline → Three.js points. Pass `z` for 2D paths at a fixed depth. */
export function pathToThree(path: (Point2 | Point3)[], z?: number): Vec3[] {
	return path.map((p) => toThree(z === undefined ? p : [p[0], p[1], z]));
}

/** Centre of the area at road level, in Three.js coordinates. */
export function boundsCenter(bounds: Bounds): Vec3 {
	return toThree([
		(bounds.min_x + bounds.max_x) / 2,
		(bounds.min_y + bounds.max_y) / 2,
		0,
	]);
}
