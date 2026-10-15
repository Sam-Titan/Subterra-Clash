import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import type { Clash } from "@/api/types";
import { toThree } from "@/lib/coords";
import { useAppStore } from "@/store/useAppStore";
import { FLY_TO } from "./sceneConfig";

/** The parts of drei's OrbitControls (makeDefault) the rig needs. */
interface OrbitLike {
	target: Vector3;
	minDistance: number;
	maxDistance: number;
	addEventListener(type: "start", listener: () => void): void;
	removeEventListener(type: "start", listener: () => void): void;
}

function isOrbitLike(value: unknown): value is OrbitLike {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as OrbitLike).target instanceof Vector3
	);
}

/**
 * Eases the orbit target to the selected clash and keeps the current viewing
 * direction, ending FLY_TO.distance away (clamped to the controls' limits).
 * Moves only when the selected id changes (never on refetch, never on
 * deselect) and stops as soon as the user drags or zooms.
 */
export function CameraRig({ clashes }: { clashes: Clash[] }) {
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const camera = useThree((s) => s.camera);
	const rawControls = useThree((s) => s.controls);
	const controls = isOrbitLike(rawControls) ? rawControls : null;

	const anim = useMemo(
		() => ({ active: false, target: new Vector3(), position: new Vector3() }),
		[],
	);
	/** Id the camera last flew to; a refetch with the same id does nothing. */
	const flownFor = useRef<string | null>(null);

	useEffect(() => {
		if (!controls) return;
		const stop = () => {
			anim.active = false;
		};
		controls.addEventListener("start", stop);
		return () => controls.removeEventListener("start", stop);
	}, [controls, anim]);

	useEffect(() => {
		if (selectedClashId === null) {
			flownFor.current = null;
			return;
		}
		if (!controls || flownFor.current === selectedClashId) return;
		const clash = clashes.find((c) => c.id === selectedClashId);
		if (!clash) return; // clashes not loaded yet; retried when they arrive
		flownFor.current = selectedClashId;

		const { x, y, z } = clash.location;
		anim.target.set(...toThree([x, y, z]));

		const direction = anim.position
			.copy(camera.position)
			.sub(controls.target)
			.normalize();
		if (direction.lengthSq() === 0) direction.set(0, 1, 1);
		if (direction.y < FLY_TO.minElevation) {
			direction.y = FLY_TO.minElevation;
			direction.normalize();
		}
		const distance = Math.min(
			Math.max(FLY_TO.distance, controls.minDistance),
			controls.maxDistance,
		);
		anim.position.copy(anim.target).addScaledVector(direction, distance);
		anim.active = true;
	}, [selectedClashId, clashes, controls, camera, anim]);

	useFrame((_, delta) => {
		if (!anim.active || !controls) return;
		const k = 1 - Math.exp(-delta * FLY_TO.rate);
		controls.target.lerp(anim.target, k);
		camera.position.lerp(anim.position, k);
		if (
			controls.target.distanceTo(anim.target) < FLY_TO.epsilon &&
			camera.position.distanceTo(anim.position) < FLY_TO.epsilon
		) {
			controls.target.copy(anim.target);
			camera.position.copy(anim.position);
			anim.active = false;
		}
	});

	return null;
}
