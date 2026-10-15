import { Line } from "@react-three/drei";
import { useMemo } from "react";
import type { BufferGeometry } from "three";
import { type Asset, UTILITIES, type Utility } from "@/api/types";
import { UTILITY_COLORS } from "@/lib/colors";
import { pathToThree, type Vec3 } from "@/lib/coords";
import type { LayerId } from "@/store/useAppStore";
import { noRaycast } from "./noRaycast";
import { LINE_WIDTH, OPACITY, RENDER_ORDER } from "./sceneConfig";
import { mergeAll, polylineToSegments, polylineTube } from "./sceneGeometry";
import { useGeometryMap } from "./useGeometryMap";

type BucketKey = `${Utility}|known` | `${Utility}|unknown`;

/**
 * Existing utilities as tubes at true depth (radius = diameter / 2), merged
 * into one mesh per utility and depth-known state (≤ 10 draw calls).
 *
 * Assets with depth_known = false are drawn at their placeholder z but
 * translucent: shown, never hidden, and visibly not to be trusted.
 *
 * A thin screen-space centreline per utility keeps pipes visible when zoomed
 * out (a 0.2 m tube is under a pixel at 500 m); up close it sits inside the
 * tube and is hidden by it.
 */
export function Pipes({
	assets,
	layers,
}: {
	assets: Asset[];
	layers: Record<LayerId, boolean>;
}) {
	const tubes = useGeometryMap<BucketKey>(() => {
		const buckets = new Map<BucketKey, (BufferGeometry | null)[]>();
		for (const a of assets) {
			const key: BucketKey = `${a.utility}|${a.depth_known ? "known" : "unknown"}`;
			const list = buckets.get(key) ?? [];
			list.push(polylineTube(a.path, a.diameter_m / 2));
			buckets.set(key, list);
		}
		const merged = new Map<BucketKey, BufferGeometry>();
		for (const [key, list] of buckets) {
			const g = mergeAll(list);
			if (g) merged.set(key, g);
		}
		return merged;
	}, [assets]);

	const overviewLines = useMemo(() => {
		const byUtility = new Map<Utility, Vec3[]>();
		for (const a of assets) {
			const list = byUtility.get(a.utility) ?? [];
			list.push(...polylineToSegments(pathToThree(a.path)));
			byUtility.set(a.utility, list);
		}
		return byUtility;
	}, [assets]);

	return (
		<group>
			{[...tubes].map(([key, geometry]) => {
				const [utility, depth] = key.split("|") as [Utility, string];
				if (!layers[utility]) return null;
				const known = depth === "known";
				return (
					<mesh
						key={key}
						geometry={geometry}
						renderOrder={
							known ? RENDER_ORDER.pipes : RENDER_ORDER.pipesUnknownDepth
						}
						raycast={noRaycast}
					>
						<meshStandardMaterial
							color={UTILITY_COLORS[utility]}
							roughness={0.55}
							metalness={0.1}
							transparent={!known}
							opacity={known ? 1 : OPACITY.pipeUnknownDepth}
							depthWrite={known}
						/>
					</mesh>
				);
			})}

			{UTILITIES.map((utility) => {
				const points = overviewLines.get(utility);
				if (!points || points.length === 0 || !layers[utility]) return null;
				return (
					<Line
						key={utility}
						points={points}
						segments
						color={UTILITY_COLORS[utility]}
						lineWidth={LINE_WIDTH.assetOverview}
						renderOrder={RENDER_ORDER.pipes}
						raycast={noRaycast}
					/>
				);
			})}
		</group>
	);
}
