import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import type { Scene } from "@/api/types";
import { SCENE_COLORS } from "@/lib/colors";
import {
	boundsCenter,
	PLAN_TO_THREE_ROTATION_X,
	pathToThree,
	toThree,
	type Vec3,
} from "@/lib/coords";
import { noRaycast } from "./noRaycast";
import { LINE_WIDTH, MAX_LABELS, OPACITY, RENDER_ORDER } from "./sceneConfig";
import {
	offsetPolyline2D,
	polylineMidpoint,
	polylineToSegments,
} from "./sceneGeometry";

const GROUND_MARGIN_M = 20;
/** Kerb lines sit just above the ground plane to avoid z-fighting. */
const KERB_Z = 0.02;
const LABEL_Z = 0.5;

interface Label {
	id: string;
	text: string;
	position: Vec3;
	kind: "street" | "landmark";
}

export function Ground({ scene, xray }: { scene: Scene; xray: boolean }) {
	const { bounds } = scene.area;
	const width = bounds.max_x - bounds.min_x + GROUND_MARGIN_M * 2;
	const depth = bounds.max_y - bounds.min_y + GROUND_MARGIN_M * 2;
	const centre = useMemo(() => boundsCenter(bounds), [bounds]);

	// All kerb lines of all streets in one LineSegments2 = one draw call.
	const kerbs = useMemo(() => {
		const segments: Vec3[] = [];
		for (const street of scene.streets) {
			for (const side of [1, -1]) {
				const edge = offsetPolyline2D(
					street.centerline,
					(side * street.width_m) / 2,
				);
				segments.push(...polylineToSegments(pathToThree(edge, KERB_Z)));
			}
		}
		return segments;
	}, [scene.streets]);

	const labels = useMemo<Label[]>(() => {
		const streetLabels: Label[] = scene.streets.map((s) => ({
			id: s.id,
			text: s.name,
			position: toThree([...polylineMidpoint(s.centerline), LABEL_Z]),
			kind: "street",
		}));
		const landmarkLabels: Label[] = scene.landmarks.map((l) => ({
			id: l.id,
			text: l.name,
			position: toThree([l.x, l.y, LABEL_Z]),
			kind: "landmark",
		}));
		return [...streetLabels, ...landmarkLabels].slice(0, MAX_LABELS);
	}, [scene.streets, scene.landmarks]);

	return (
		<group>
			<mesh
				position={centre}
				rotation-x={PLAN_TO_THREE_ROTATION_X}
				renderOrder={RENDER_ORDER.ground}
				raycast={noRaycast}
			>
				<planeGeometry args={[width, depth]} />
				<meshBasicMaterial
					color={SCENE_COLORS.ground}
					transparent
					opacity={xray ? OPACITY.groundXray : OPACITY.groundSolid}
					depthWrite={false}
				/>
			</mesh>

			{kerbs.length > 0 && (
				<Line
					points={kerbs}
					segments
					color={SCENE_COLORS.streetOutline}
					lineWidth={LINE_WIDTH.kerb}
					renderOrder={RENDER_ORDER.overlayLines}
					raycast={noRaycast}
				/>
			)}

			{labels.map((label) => (
				<Html
					key={label.id}
					position={label.position}
					center
					pointerEvents="none"
					zIndexRange={[10, 0]}
				>
					<span
						className={
							label.kind === "street"
								? "whitespace-nowrap rounded bg-zinc-950/70 px-1.5 py-0.5 text-xs font-medium"
								: "whitespace-nowrap text-xs italic opacity-80"
						}
						style={{ color: SCENE_COLORS.label }}
					>
						{label.text}
					</span>
				</Html>
			))}
		</group>
	);
}
