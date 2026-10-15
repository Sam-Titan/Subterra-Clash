import { Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { type BufferGeometry, EdgesGeometry } from "three";
import type { Point2, Work } from "@/api/types";
import { WORK_COLOR } from "@/lib/colors";
import { pathToThree, type Vec3 } from "@/lib/coords";
import { noRaycast } from "./noRaycast";
import { LINE_WIDTH, OPACITY, RENDER_ORDER } from "./sceneConfig";
import {
	hddGeometry,
	mergeAll,
	pipeLayGeometry,
	pitGeometry,
	polylineToSegments,
	trenchGeometry,
} from "./sceneGeometry";
import { useGeometryMap } from "./useGeometryMap";

const FOOTPRINT_Z = 0.03;
/** Edges sharper than this get an outline on the excavation volumes. */
const EDGE_THRESHOLD_DEG = 30;

type Part = "volumes" | "bores";

/** 2D outline drawn on the road surface, so works stay visible zoomed out. */
function footprint(work: Work): Point2[] {
	if (work.work_type === "HDD" && work.bore_path)
		return work.bore_path.map(([x, y]) => [x, y] as Point2);
	if (work.work_type === "PIT" && work.path.length > 2) {
		const [first, last] = [work.path[0], work.path[work.path.length - 1]];
		const closed = first[0] === last[0] && first[1] === last[1];
		return closed ? work.path : [...work.path, first];
	}
	return work.path;
}

/**
 * Proposed works in APWA pink (SPEC §8.1 shapes):
 * - excavation volumes (TRENCH boxes, PIT extrusion, the PIPE_LAY trench):
 *   translucent, depthWrite off, merged into one mesh plus one edge outline;
 * - bores and new pipes (HDD bore, PIPE_LAY pipe): solid tubes, one mesh;
 * - every work's footprint as a screen-space line on the surface.
 * An HDD without bore_path or a PIPE_LAY without bore_diameter shows only its
 * footprint: geometry that is missing is not invented.
 */
export function WorkVolumes({ works }: { works: Work[] }) {
	const parts = useGeometryMap<Part>(() => {
		const volumes: (BufferGeometry | null)[] = [];
		const bores: (BufferGeometry | null)[] = [];
		for (const w of works) {
			switch (w.work_type) {
				case "TRENCH":
					volumes.push(trenchGeometry(w));
					break;
				case "PIT":
					volumes.push(pitGeometry(w));
					break;
				case "HDD":
					bores.push(hddGeometry(w));
					break;
				case "PIPE_LAY":
					volumes.push(trenchGeometry(w));
					bores.push(pipeLayGeometry(w));
					break;
			}
		}
		const out = new Map<Part, BufferGeometry>();
		const v = mergeAll(volumes);
		const b = mergeAll(bores);
		if (v) out.set("volumes", v);
		if (b) out.set("bores", b);
		return out;
	}, [works]);

	const volumes = parts.get("volumes");
	const bores = parts.get("bores");

	const edges = useMemo(
		() => (volumes ? new EdgesGeometry(volumes, EDGE_THRESHOLD_DEG) : null),
		[volumes],
	);
	useEffect(() => () => edges?.dispose(), [edges]);

	const footprints = useMemo(() => {
		const segments: Vec3[] = [];
		for (const w of works)
			segments.push(
				...polylineToSegments(pathToThree(footprint(w), FOOTPRINT_Z)),
			);
		return segments;
	}, [works]);

	return (
		<group>
			{volumes && (
				<mesh
					geometry={volumes}
					renderOrder={RENDER_ORDER.works}
					raycast={noRaycast}
				>
					<meshStandardMaterial
						color={WORK_COLOR}
						transparent
						opacity={OPACITY.works}
						depthWrite={false}
						roughness={0.8}
					/>
				</mesh>
			)}
			{edges && (
				<lineSegments
					geometry={edges}
					renderOrder={RENDER_ORDER.works}
					raycast={noRaycast}
				>
					<lineBasicMaterial
						color={WORK_COLOR}
						transparent
						opacity={OPACITY.workEdges}
						depthWrite={false}
					/>
				</lineSegments>
			)}
			{bores && (
				<mesh
					geometry={bores}
					renderOrder={RENDER_ORDER.pipes}
					raycast={noRaycast}
				>
					<meshStandardMaterial
						color={WORK_COLOR}
						roughness={0.5}
						emissive={WORK_COLOR}
						emissiveIntensity={0.25}
					/>
				</mesh>
			)}
			{footprints.length > 0 && (
				<Line
					points={footprints}
					segments
					color={WORK_COLOR}
					lineWidth={LINE_WIDTH.footprint}
					renderOrder={RENDER_ORDER.overlayLines}
					raycast={noRaycast}
				/>
			)}
		</group>
	);
}
