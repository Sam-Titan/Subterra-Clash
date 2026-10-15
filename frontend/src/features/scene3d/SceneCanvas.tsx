import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { type ReactNode, useMemo } from "react";
import type { Clash, Scene } from "@/api/types";
import { SCENE_COLORS } from "@/lib/colors";
import { boundsCenter, type Vec3 } from "@/lib/coords";
import { useAppStore } from "@/store/useAppStore";
import { ClashMarkers } from "./ClashMarkers";
import { Ground } from "./Ground";
import { Pipes } from "./Pipes";
import { cameraSettings, fogSettings } from "./sceneConfig";
import { UncertaintyHalos } from "./UncertaintyHalos";
import { WorkVolumes } from "./WorkVolumes";

export interface SceneCanvasProps {
	scene: Scene;
	clashes: Clash[];
	/** Extra scene children (e.g. dev-only probes). */
	children?: ReactNode;
}

/**
 * The "X-ray street": translucent ground, pipes at true depth, pink works,
 * uncertainty halos and clash markers. Layer, x-ray and halo state comes from
 * the app store; clicking empty space clears the selection.
 */
export default function SceneCanvas({
	scene,
	clashes,
	children,
}: SceneCanvasProps) {
	const layers = useAppStore((s) => s.layers);
	const xray = useAppStore((s) => s.xray);
	const halos = useAppStore((s) => s.halos);
	const selectClash = useAppStore((s) => s.selectClash);

	const { bounds } = scene.area;
	const camera = useMemo(() => cameraSettings(bounds), [bounds]);
	const fog = useMemo(() => fogSettings(bounds), [bounds]);
	const target = useMemo(() => boundsCenter(bounds), [bounds]);
	const cameraPosition = useMemo<Vec3>(
		() => [
			target[0] + camera.offset[0],
			target[1] + camera.offset[1],
			target[2] + camera.offset[2],
		],
		[target, camera],
	);

	return (
		<Canvas
			camera={{
				position: cameraPosition,
				fov: camera.fov,
				near: camera.near,
				far: camera.far,
			}}
			dpr={[1, 2]}
			gl={{ antialias: true }}
			onPointerMissed={() => selectClash(null)}
		>
			<color attach="background" args={[SCENE_COLORS.background]} />
			<fog attach="fog" args={[SCENE_COLORS.background, fog.near, fog.far]} />
			<ambientLight intensity={0.6} />
			<directionalLight
				position={[target[0] + 200, 400, target[2] + 300]}
				intensity={1.4}
				color={SCENE_COLORS.keyLight}
			/>
			<directionalLight
				position={[target[0] - 300, -200, target[2] - 200]}
				intensity={0.5}
				color={SCENE_COLORS.fillLight}
			/>

			<Ground scene={scene} xray={xray} />
			<Pipes assets={scene.assets} layers={layers} />
			{halos && <UncertaintyHalos assets={scene.assets} layers={layers} />}
			{layers.WORKS && <WorkVolumes works={scene.works} />}
			<ClashMarkers clashes={clashes} />

			<OrbitControls
				makeDefault
				target={target}
				minDistance={camera.minDistance}
				maxDistance={camera.maxDistance}
				enableDamping
			/>
			{children}
		</Canvas>
	);
}
