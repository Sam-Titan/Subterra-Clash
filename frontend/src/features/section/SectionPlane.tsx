import { Line } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { DoubleSide, Plane, Vector3 } from "three";
import type { Bounds } from "@/api/types";
import { noRaycast } from "@/features/scene3d/noRaycast";
import { OPACITY, RENDER_ORDER, SECTION } from "@/features/scene3d/sceneConfig";
import { SECTION_COLORS } from "@/lib/colors";
import { fromThree, headingToThreeYaw, toThree, type Vec3 } from "@/lib/coords";
import { useAppStore } from "@/store/useAppStore";
import {
	offsetRange,
	type SectionState,
	sectionFrame,
} from "./sectionGeometry";

/** The parts of drei's OrbitControls (makeDefault) the drag needs. */
interface Toggleable {
	enabled: boolean;
}

function isToggleable(value: unknown): value is Toggleable {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as Toggleable).enabled === "boolean"
	);
}

function setCursor(cursor: string) {
	document.body.style.cursor = cursor;
}

/**
 * Translucent vertical plane where the cross-section is cut, with a handle
 * bar above the road. Dragging the handle moves the plane along its normal
 * (orbit is paused while dragging). The plane itself takes no clicks, so it
 * never blocks a clash marker.
 */
export function SectionPlane({
	section,
	depth,
	bounds,
}: {
	section: SectionState;
	/** Plane depth below the road (m, positive). */
	depth: number;
	bounds: Bounds;
}) {
	const setSection = useAppStore((s) => s.setSection);
	const rawControls = useThree((s) => s.controls);
	const controls = isToggleable(rawControls) ? rawControls : null;

	const frame = useMemo(() => sectionFrame(section), [section]);
	const position = useMemo(
		() => toThree([frame.origin[0], frame.origin[1], 0]),
		[frame],
	);
	const yaw = headingToThreeYaw(frame.across[0], frame.across[1]);
	const hw = frame.halfWidth;

	const outline = useMemo<Vec3[]>(
		() => [
			[-hw, 0, 0],
			[hw, 0, 0],
			[hw, -depth, 0],
			[-hw, -depth, 0],
			[-hw, 0, 0],
		],
		[hw, depth],
	);

	const { anchor, normal } = section;
	const range = useMemo(
		() => offsetRange({ anchor, normal }, bounds),
		[anchor, normal, bounds],
	);

	// Drag state lives outside React; store updates are batched per frame.
	const drag = useMemo(
		() => ({
			active: false,
			raf: 0,
			pending: 0,
			/** section.offset − pointer offset at grab, so the plane does not jump. */
			grab: 0,
			ground: new Plane(new Vector3(0, 1, 0), 0),
			hit: new Vector3(),
		}),
		[],
	);
	const latest = useRef(section);
	latest.current = section;

	const pointerOffset = (e: ThreeEvent<PointerEvent>): number | null => {
		if (!e.ray.intersectPlane(drag.ground, drag.hit)) return null;
		const [x, y] = fromThree([drag.hit.x, drag.hit.y, drag.hit.z]);
		const s = latest.current;
		return (x - s.anchor[0]) * s.normal[0] + (y - s.anchor[1]) * s.normal[1];
	};

	const endDrag = () => {
		if (!drag.active) return;
		drag.active = false;
		if (controls) controls.enabled = true;
		setCursor("grab");
	};

	useEffect(
		() => () => {
			cancelAnimationFrame(drag.raf);
			drag.raf = 0;
			if (drag.active && controls) controls.enabled = true;
			drag.active = false;
			setCursor("");
		},
		[drag, controls],
	);

	const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
		e.stopPropagation();
		const at = pointerOffset(e);
		drag.grab = at === null ? 0 : latest.current.offset - at;
		drag.active = true;
		(e.target as Element).setPointerCapture(e.pointerId);
		if (controls) controls.enabled = false;
		setCursor("grabbing");
	};

	const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
		if (!drag.active) return;
		e.stopPropagation();
		const at = pointerOffset(e);
		if (at === null) return;
		drag.pending = Math.min(Math.max(at + drag.grab, range[0]), range[1]);
		if (drag.raf) return;
		drag.raf = requestAnimationFrame(() => {
			drag.raf = 0;
			setSection({ ...latest.current, offset: drag.pending });
		});
	};

	const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
		const target = e.target as Element;
		if (target.hasPointerCapture(e.pointerId))
			target.releasePointerCapture(e.pointerId);
		endDrag();
	};

	return (
		<group position={position} rotation-y={yaw}>
			<mesh
				position={[0, -depth / 2, 0]}
				renderOrder={RENDER_ORDER.section}
				raycast={noRaycast}
			>
				<planeGeometry args={[hw * 2, depth]} />
				<meshBasicMaterial
					color={SECTION_COLORS.plane}
					transparent
					opacity={OPACITY.sectionPlane}
					side={DoubleSide}
					depthWrite={false}
				/>
			</mesh>
			<Line
				points={outline}
				color={SECTION_COLORS.plane}
				lineWidth={1.5}
				transparent
				opacity={OPACITY.sectionOutline}
				renderOrder={RENDER_ORDER.section}
				raycast={noRaycast}
			/>

			{/* Handle: a bar across the cut above the road. */}
			<mesh
				position={[0, SECTION.handleHeight, 0]}
				renderOrder={RENDER_ORDER.section}
				raycast={noRaycast}
			>
				<boxGeometry
					args={[hw * 2, SECTION.handleThickness, SECTION.handleThickness]}
				/>
				<meshBasicMaterial color={SECTION_COLORS.handle} />
			</mesh>
			<mesh
				position={[0, SECTION.handleHeight, 0]}
				visible={false}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={endDrag}
				onLostPointerCapture={endDrag}
				onPointerOver={(e) => {
					e.stopPropagation();
					if (!drag.active) setCursor("grab");
				}}
				onPointerOut={() => {
					if (!drag.active) setCursor("");
				}}
			>
				<boxGeometry
					args={[hw * 2, SECTION.handleHitSize, SECTION.handleHitSize]}
				/>
			</mesh>
		</group>
	);
}
