import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
	BoxGeometry,
	type BufferGeometry,
	Color,
	CylinderGeometry,
	IcosahedronGeometry,
	type InstancedMesh,
	type Material,
	type MeshLambertMaterial,
	Object3D,
} from "three";
import type { Clash, Scene } from "@/api/types";
import { headingToThreeYaw, toThree } from "@/lib/coords";
import { noRaycast } from "../noRaycast";
import { CITY_FADE_RATE, OPACITY, RENDER_ORDER } from "../sceneConfig";
import { buildCityLayout, type Prim, type PrimShape } from "./cityLayout";

/** Unit shapes with their base at y = 0, so a Prim's z is its footing. */
function makeGeometries(): Record<PrimShape, BufferGeometry> {
	return {
		box: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
		cylinder: new CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
		// Four-sided cone turned 45° = a pyramid whose base is the unit square.
		pyramid: new CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1)
			.rotateY(Math.PI / 4)
			.translate(0, 0.5, 0),
		blob: new IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0),
	};
}

function Instances({
	prims,
	geometry,
	register,
}: {
	prims: readonly Prim[];
	geometry: BufferGeometry;
	register: (m: Material | null) => (() => void) | undefined;
}) {
	const ref = useRef<InstancedMesh>(null);

	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		const dummy = new Object3D();
		const color = new Color();
		prims.forEach((p, i) => {
			dummy.position.set(...toThree([p.x, p.y, p.z]));
			dummy.rotation.set(
				0,
				headingToThreeYaw(Math.cos(p.yaw), Math.sin(p.yaw)),
				0,
			);
			dummy.scale.set(p.sx || 1e-3, p.sy || 1e-3, p.sz || 1e-3);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
			mesh.setColorAt(i, color.set(p.color));
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		mesh.computeBoundingSphere();
	}, [prims]);

	if (prims.length === 0) return null;
	return (
		<instancedMesh
			// A new count needs a new InstancedMesh (fixed-size buffers).
			key={prims.length}
			ref={ref}
			args={[geometry, undefined, prims.length]}
			renderOrder={RENDER_ORDER.city}
			raycast={noRaycast}
		>
			<meshLambertMaterial ref={register} transparent />
		</instancedMesh>
	);
}

/**
 * Low-poly city on top of the ground (SPEC §10.2): road slabs, footpaths,
 * lane markings, buildings, lamps, trees and landmark shapes, instanced per
 * primitive shape (≈ 8 draw calls). X-ray fades it: road layer and buildings
 * ease to low opacity and stop writing depth so pipes, works and markers show
 * through. Nothing is allocated per frame.
 */
export function CityContext({
	scene,
	clashes,
	xray,
}: {
	scene: Scene;
	clashes: readonly Clash[];
	xray: boolean;
}) {
	const geometries = useMemo(makeGeometries, []);
	useEffect(
		() => () => {
			for (const g of Object.values(geometries)) g.dispose();
		},
		[geometries],
	);

	// Rebuilt only when the plan or clash positions change, not on refetch
	// with equal data (the queries keep structural sharing).
	const layout = useMemo(
		() =>
			buildCityLayout({
				bounds: scene.area.bounds,
				streets: scene.streets,
				landmarks: scene.landmarks,
				works: scene.works,
				clashPoints: clashes.map((c) => [c.location.x, c.location.y]),
			}),
		[scene.area.bounds, scene.streets, scene.landmarks, scene.works, clashes],
	);

	const xrayRef = useRef(xray);
	xrayRef.current = xray;

	const groundMats = useRef(new Set<MeshLambertMaterial>());
	const builtMats = useRef(new Set<MeshLambertMaterial>());
	// Ref callbacks: a new material starts at the current target (no flash on
	// mount) and is dropped from the fade set when its mesh unmounts.
	const { registerGround, registerBuilt } = useMemo(() => {
		const make =
			(set: Set<MeshLambertMaterial>, solid: number, faded: number) =>
			(m: Material | null) => {
				if (!m) return undefined;
				const mat = m as MeshLambertMaterial;
				mat.opacity = xrayRef.current ? faded : solid;
				mat.depthWrite = mat.opacity > OPACITY.cityDepthWriteAbove;
				set.add(mat);
				return () => {
					set.delete(mat);
				};
			};
		return {
			registerGround: make(
				groundMats.current,
				OPACITY.cityGroundSolid,
				OPACITY.cityGroundXray,
			),
			registerBuilt: make(
				builtMats.current,
				OPACITY.cityBuiltSolid,
				OPACITY.cityBuiltXray,
			),
		};
	}, []);

	useFrame((_, delta) => {
		const k = 1 - Math.exp(-delta * CITY_FADE_RATE);
		const on = xrayRef.current;
		const fade = (mats: Set<MeshLambertMaterial>, target: number) => {
			for (const m of mats) {
				const next =
					Math.abs(m.opacity - target) < 0.002
						? target
						: m.opacity + (target - m.opacity) * k;
				if (next === m.opacity) continue;
				m.opacity = next;
				m.depthWrite = next > OPACITY.cityDepthWriteAbove;
			}
		};
		fade(
			groundMats.current,
			on ? OPACITY.cityGroundXray : OPACITY.cityGroundSolid,
		);
		fade(
			builtMats.current,
			on ? OPACITY.cityBuiltXray : OPACITY.cityBuiltSolid,
		);
	});

	return (
		<group>
			<Instances
				prims={layout.ground.box}
				geometry={geometries.box}
				register={registerGround}
			/>
			{(Object.keys(layout.built) as PrimShape[]).map((shape) => (
				<Instances
					key={shape}
					prims={layout.built[shape]}
					geometry={geometries[shape]}
					register={registerBuilt}
				/>
			))}
		</group>
	);
}
