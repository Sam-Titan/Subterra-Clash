// Camera, fog, transparency and render-order settings for the 3D scene.
// Distances are derived from the area span (600 × 400 m for Sector 7), so the
// far corner of the area never fogs out and depth precision stays usable.

import type { Bounds } from "@/api/types";

export function sceneSpan(bounds: Bounds): number {
	return Math.max(bounds.max_x - bounds.min_x, bounds.max_y - bounds.min_y, 1);
}

/**
 * span 600 → camera ~560 m from the centre, far corner ~790 m away.
 * near 0.5 / far 3600 keeps 24-bit depth resolution ≈ 3 cm at 500 m, enough to
 * separate pipes 0.2 m apart without z-fighting.
 */
export function cameraSettings(bounds: Bounds) {
	const span = sceneSpan(bounds);
	return {
		near: 0.5,
		far: span * 6,
		fov: 45,
		/** Offset from the area centre: up and towards the south. */
		offset: [0, span * 0.55, span * 0.75] as [number, number, number],
		minDistance: 3,
		maxDistance: span * 2,
	};
}

/**
 * Linear fog that starts past the far corner of the default view
 * (~790 m for span 600) and only reaches ~35 % at the max zoom-out distance.
 */
export function fogSettings(bounds: Bounds) {
	const span = sceneSpan(bounds);
	return { near: span * 1.4, far: span * 5 };
}

/**
 * Explicit draw order for transparent layers (three.js draws opaque first,
 * then transparent sorted by renderOrder, then distance). All transparent
 * layers set depthWrite={false} so they never hide what is behind them:
 * pipes stay visible through the ground with x-ray on or off, and halos never
 * hide the pipe inside them.
 */
export const RENDER_ORDER = {
	pipes: 0, // opaque (depth known)
	pipesUnknownDepth: 1,
	works: 2,
	halos: 3,
	ground: 4,
	overlayLines: 5, // street kerbs, work footprints, leader lines
	markers: 6,
} as const;

export const OPACITY = {
	groundXray: 0.12,
	groundSolid: 0.85,
	pipeUnknownDepth: 0.35,
	works: 0.3,
	workEdges: 0.8,
	halo: 0.1,
} as const;

/** Screen-space widths (px) for lines that must stay visible from far away. */
export const LINE_WIDTH = {
	kerb: 1,
	footprint: 2,
	assetOverview: 1.5,
	leader: 1,
} as const;

/** Clash markers keep a roughly constant screen size: scale = distance × k. */
export const MARKER = {
	radius: 0.6,
	/** Invisible pick sphere, larger than the visible head for easy clicking. */
	hitRadius: 1.6,
	scalePerMetre: 0.004,
	minScale: 0.6,
	maxScale: 8,
	pulseHz: 1.2,
} as const;

/** At most this many street + landmark labels; no occlusion tests. */
export const MAX_LABELS = 16;
