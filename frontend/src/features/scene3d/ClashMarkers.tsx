import { Billboard, Html, Line } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	type Group,
	type Mesh,
	type MeshBasicMaterial,
	RingGeometry,
	SphereGeometry,
} from "three";
import type { Clash } from "@/api/types";
import {
	CERTAINTY_COLORS,
	CERTAINTY_STYLE,
	INTAKE_COLORS,
	SCENE_COLORS,
	SEVERITY_BAND_COLORS,
} from "@/lib/colors";
import { toThree, type Vec3 } from "@/lib/coords";
import { useAppStore } from "@/store/useAppStore";
import { noRaycast } from "./noRaycast";
import { LINE_WIDTH, MARKER, RENDER_ORDER } from "./sceneConfig";

/** Leader lines run from the clash up to just above the road surface. */
const LEADER_TOP_Z = 1.5;
const PULSE_MAX_OPACITY = 0.8;
const PULSE_GROWTH = 1.5;

/** Scale-in time (s) for clashes added by the latest permit commit. */
const SPAWN_SECONDS = 0.8;

interface MarkerEntry {
	group: Group;
	pulse: Mesh | null;
	/** Scale-in still running; `start` < 0 until its first frame. */
	spawn: { start: number } | null;
}

interface SharedGeometry {
	head: SphereGeometry;
	hit: SphereGeometry;
	pulse: RingGeometry;
	selected: RingGeometry;
	fresh: RingGeometry;
}

/** Overshoots slightly, then settles at 1. */
function easeOutBack(t: number): number {
	const c = 1.7;
	return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

function circlePoints(radius: number, steps = 40): Vec3[] {
	const points: Vec3[] = [];
	for (let i = 0; i <= steps; i++) {
		const a = (i / steps) * Math.PI * 2;
		points.push([Math.cos(a) * radius, Math.sin(a) * radius, 0]);
	}
	return points;
}

const POSSIBLE_RING = circlePoints(MARKER.radius * 1.5);

function setCursor(pointer: boolean) {
	document.body.style.cursor = pointer ? "pointer" : "";
}

/**
 * One marker per clash at `location`, styled by certainty (SPEC §10):
 * LIKELY = solid + pulse, POSSIBLE = dashed ring, NEEDS_DATA = grey + "?".
 * Filtered by the certainty filter only; hiding a utility layer never hides a
 * clash. Markers keep a near-constant screen size, and each has an invisible
 * pick sphere larger than its visible head.
 */
export function ClashMarkers({ clashes }: { clashes: Clash[] }) {
	const certaintyFilter = useAppStore((s) => s.certaintyFilter);
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const selectClash = useAppStore((s) => s.selectClash);
	const intakeResult = useAppStore((s) => s.intakeResult);
	const reduceMotion = useReducedMotion();
	const fresh = useMemo(
		() => new Set(intakeResult?.clashIds ?? []),
		[intakeResult],
	);

	const visible = useMemo(
		() => clashes.filter((c) => certaintyFilter.includes(c.certainty)),
		[clashes, certaintyFilter],
	);

	const geometry = useMemo<SharedGeometry>(
		() => ({
			head: new SphereGeometry(MARKER.radius, 16, 12),
			hit: new SphereGeometry(MARKER.hitRadius, 8, 6),
			pulse: new RingGeometry(MARKER.radius * 1.2, MARKER.radius * 1.5, 32),
			selected: new RingGeometry(MARKER.radius * 2, MARKER.radius * 2.4, 40),
			fresh: new RingGeometry(MARKER.radius * 2.7, MARKER.radius * 3, 40),
		}),
		[],
	);
	useEffect(
		() => () => {
			for (const g of Object.values(geometry)) g.dispose();
		},
		[geometry],
	);

	// All leader lines in one LineSegments2.
	const leaders = useMemo(() => {
		const segments: Vec3[] = [];
		for (const c of visible) {
			const { x, y, z } = c.location;
			segments.push(toThree([x, y, z]), toThree([x, y, LEADER_TOP_Z]));
		}
		return segments;
	}, [visible]);

	// One frame loop for every marker: screen-size scaling and the LIKELY pulse.
	// Mutates existing objects only; no allocations per frame.
	const entries = useRef(new Map<string, MarkerEntry>());
	const register = useCallback((id: string, entry: MarkerEntry | null) => {
		if (entry) entries.current.set(id, entry);
		else entries.current.delete(id);
	}, []);

	useFrame(({ camera, clock }) => {
		const phase = (clock.elapsedTime * MARKER.pulseHz) % 1;
		for (const entry of entries.current.values()) {
			const { group, pulse, spawn } = entry;
			const d = group.position.distanceTo(camera.position);
			let scale = Math.min(
				MARKER.maxScale,
				Math.max(MARKER.minScale, d * MARKER.scalePerMetre),
			);
			if (spawn) {
				if (spawn.start < 0) spawn.start = clock.elapsedTime;
				const t = Math.min(
					1,
					(clock.elapsedTime - spawn.start) / SPAWN_SECONDS,
				);
				scale *= Math.max(0.001, easeOutBack(t));
				if (t >= 1) entry.spawn = null;
			}
			group.scale.setScalar(scale);
			if (pulse) {
				pulse.scale.setScalar(1 + phase * PULSE_GROWTH);
				(pulse.material as MeshBasicMaterial).opacity =
					PULSE_MAX_OPACITY * (1 - phase);
			}
		}
	});

	useEffect(() => () => setCursor(false), []);

	return (
		<group>
			{leaders.length > 0 && (
				<Line
					points={leaders}
					segments
					color={SCENE_COLORS.leader}
					lineWidth={LINE_WIDTH.leader}
					renderOrder={RENDER_ORDER.overlayLines}
					raycast={noRaycast}
				/>
			)}
			{visible.map((clash) => (
				<Marker
					key={clash.id}
					clash={clash}
					selected={clash.id === selectedClashId}
					fresh={fresh.has(clash.id)}
					animateIn={fresh.has(clash.id) && !reduceMotion}
					geometry={geometry}
					onSelect={selectClash}
					register={register}
				/>
			))}
		</group>
	);
}

function Marker({
	clash,
	selected,
	fresh,
	animateIn,
	geometry,
	onSelect,
	register,
}: {
	clash: Clash;
	selected: boolean;
	/** Added by the latest permit commit: extra ring until the banner closes. */
	fresh: boolean;
	/** Scale in on mount (off with prefers-reduced-motion). */
	animateIn: boolean;
	geometry: SharedGeometry;
	onSelect: (id: string) => void;
	register: (id: string, entry: MarkerEntry | null) => void;
}) {
	const groupRef = useRef<Group>(null);
	const pulseRef = useRef<Mesh>(null);
	const style = CERTAINTY_STYLE[clash.certainty];
	const color = CERTAINTY_COLORS[clash.certainty];
	const position = useMemo(
		() => toThree([clash.location.x, clash.location.y, clash.location.z]),
		[clash.location],
	);

	// animateIn is read once at mount: a marker that already exists never
	// re-plays its scale-in.
	const spawnAtMount = useRef(animateIn);
	useEffect(() => {
		if (!groupRef.current) return;
		register(clash.id, {
			group: groupRef.current,
			pulse: pulseRef.current,
			spawn: spawnAtMount.current ? { start: -1 } : null,
		});
		spawnAtMount.current = false;
		return () => register(clash.id, null);
	}, [clash.id, register]);

	const handleClick = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		onSelect(clash.id);
	};

	return (
		<group ref={groupRef} position={position}>
			{/* Larger pick target. visible={false} skips drawing it (no draw call);
			    three.js raycasting ignores visibility, so it still receives clicks. */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: three.js mesh, not a DOM element; the rail and queue offer keyboard access */}
			<mesh
				geometry={geometry.hit}
				visible={false}
				onClick={handleClick}
				onPointerOver={(e) => {
					e.stopPropagation();
					setCursor(true);
				}}
				onPointerOut={() => setCursor(false)}
			/>

			<Billboard>
				{style === "solid-pulse" && (
					<>
						<mesh
							geometry={geometry.head}
							renderOrder={RENDER_ORDER.markers}
							raycast={noRaycast}
						>
							<meshBasicMaterial color={color} />
						</mesh>
						<mesh
							ref={pulseRef}
							geometry={geometry.pulse}
							renderOrder={RENDER_ORDER.markers}
							raycast={noRaycast}
						>
							<meshBasicMaterial
								color={color}
								transparent
								opacity={PULSE_MAX_OPACITY}
								depthWrite={false}
							/>
						</mesh>
					</>
				)}

				{style === "dashed-ring" && (
					<>
						<mesh
							geometry={geometry.head}
							scale={0.45}
							renderOrder={RENDER_ORDER.markers}
							raycast={noRaycast}
						>
							<meshBasicMaterial color={color} />
						</mesh>
						<Line
							points={POSSIBLE_RING}
							color={color}
							lineWidth={2}
							dashed
							dashSize={0.3}
							gapSize={0.2}
							renderOrder={RENDER_ORDER.markers}
							raycast={noRaycast}
						/>
					</>
				)}

				{style === "question" && (
					<>
						<mesh
							geometry={geometry.head}
							renderOrder={RENDER_ORDER.markers}
							raycast={noRaycast}
						>
							<meshBasicMaterial color={color} />
						</mesh>
						<Html center pointerEvents="none" zIndexRange={[20, 10]}>
							<span className="select-none text-xs font-bold text-zinc-950">
								?
							</span>
						</Html>
					</>
				)}

				{fresh && (
					<mesh
						geometry={geometry.fresh}
						renderOrder={RENDER_ORDER.markers}
						raycast={noRaycast}
					>
						<meshBasicMaterial
							color={INTAKE_COLORS.newClashRing}
							depthWrite={false}
						/>
					</mesh>
				)}

				{selected && (
					<mesh
						geometry={geometry.selected}
						renderOrder={RENDER_ORDER.markers}
						raycast={noRaycast}
					>
						<meshBasicMaterial
							color={SEVERITY_BAND_COLORS[clash.severity.band]}
							depthWrite={false}
						/>
					</mesh>
				)}
			</Billboard>
		</group>
	);
}
