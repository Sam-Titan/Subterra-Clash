import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import type { Clash, Scene } from "@/api/types";
import { toThree, type Vec3 } from "@/lib/coords";
import { useAppStore } from "@/store/useAppStore";
import { defaultStreetId, streetViewPose } from "./city/cityLayout";
import { FLY_TO, NEAR_PLANE } from "./sceneConfig";

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
 *
 * Also runs the Street level / Overview presets (SPEC §10.2): each request
 * (`viewNonce`) eases to the preset pose with the same motion. Street level
 * uses a 0.1 m near plane so kerbs at eye height do not clip; Overview puts
 * the 0.5 m plane back for depth precision far away.
 */
export function CameraRig({
	clashes,
	scene,
	overview,
}: {
	clashes: Clash[];
	scene: Scene;
	/** The initial orbit pose (camera position + target), Three.js frame. */
	overview: { position: Vec3; target: Vec3 };
}) {
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const viewMode = useAppStore((s) => s.viewMode);
	const viewNonce = useAppStore((s) => s.viewNonce);
	const streetViewId = useAppStore((s) => s.streetViewId);
	const releaseView = useAppStore((s) => s.releaseView);
	const camera = useThree((s) => s.camera);
	const rawControls = useThree((s) => s.controls);
	const controls = isOrbitLike(rawControls) ? rawControls : null;

	const anim = useMemo(
		() => ({ active: false, target: new Vector3(), position: new Vector3() }),
		[],
	);
	const viewDirection = useMemo(() => new Vector3(), []);
	/** Id the camera last flew to; a refetch with the same id does nothing. */
	const flownFor = useRef<string | null>(null);

	useEffect(() => {
		if (!controls) return;
		const stop = () => {
			anim.active = false;
			releaseView();
		};
		controls.addEventListener("start", stop);
		return () => controls.removeEventListener("start", stop);
	}, [controls, anim, releaseView]);

	// The canvas mounts at the overview pose; make the toolbar agree.
	useEffect(() => {
		useAppStore.setState({ viewMode: "overview" });
	}, []);

	// Presets: only a new request moves the camera (not a scene refetch).
	const viewFor = useRef(viewNonce);
	useEffect(() => {
		if (!controls || viewFor.current === viewNonce) return;
		viewFor.current = viewNonce;
		let position: Vec3 = overview.position;
		let target: Vec3 = overview.target;
		let near: number = NEAR_PLANE.overview;
		if (viewMode === "street") {
			const id = streetViewId ?? defaultStreetId(scene.streets);
			const street = scene.streets.find((s) => s.id === id);
			if (!street) return;
			const pose = streetViewPose(street, scene.junctions);
			position = toThree(pose.eye);
			target = toThree(pose.target);
			near = NEAR_PLANE.street;
		}
		if (camera instanceof PerspectiveCamera && camera.near !== near) {
			camera.near = near;
			camera.updateProjectionMatrix();
		}
		anim.target.set(...target);
		anim.position.set(...position);
		anim.active = true;
	}, [
		viewNonce,
		viewMode,
		streetViewId,
		scene,
		overview,
		controls,
		camera,
		anim,
	]);

	useEffect(() => {
		if (selectedClashId === null) {
			flownFor.current = null;
			return;
		}
		if (!controls || flownFor.current === selectedClashId) return;
		const clash = clashes.find((c) => c.id === selectedClashId);
		if (!clash) return; // clashes not loaded yet; retried when they arrive
		flownFor.current = selectedClashId;
		releaseView();

		const { x, y, z } = clash.location;
		anim.target.set(...toThree([x, y, z]));

		// Its own vector: sharing `anim.position` made the direction the target
		// itself once the position was overwritten below.
		const direction = viewDirection
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
		if (!Number.isFinite(anim.position.lengthSq())) return; // never fly to NaN
		anim.active = true;
	}, [
		selectedClashId,
		clashes,
		controls,
		camera,
		anim,
		viewDirection,
		releaseView,
	]);

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
