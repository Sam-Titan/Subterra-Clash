import type { BufferGeometry } from "three";
import type { Asset, Utility } from "@/api/types";
import { UTILITY_COLORS } from "@/lib/colors";
import type { LayerId } from "@/store/useAppStore";
import { noRaycast } from "./noRaycast";
import { OPACITY, RENDER_ORDER } from "./sceneConfig";
import { mergeAll, polylineTube } from "./sceneGeometry";
import { useGeometryMap } from "./useGeometryMap";

/**
 * Faint wider tube around each asset showing where it might really be:
 * radius = diameter / 2 + horiz_precision_m (SPEC §10). One merged mesh per
 * utility. Transparent with depthWrite off and drawn after the pipes, so a halo
 * never hides the pipe inside it.
 */
export function UncertaintyHalos({
	assets,
	layers,
}: {
	assets: Asset[];
	layers: Record<LayerId, boolean>;
}) {
	const halos = useGeometryMap<Utility>(() => {
		const buckets = new Map<Utility, (BufferGeometry | null)[]>();
		for (const a of assets) {
			const list = buckets.get(a.utility) ?? [];
			list.push(polylineTube(a.path, a.diameter_m / 2 + a.horiz_precision_m));
			buckets.set(a.utility, list);
		}
		const merged = new Map<Utility, BufferGeometry>();
		for (const [utility, list] of buckets) {
			const g = mergeAll(list);
			if (g) merged.set(utility, g);
		}
		return merged;
	}, [assets]);

	return (
		<group>
			{[...halos].map(([utility, geometry]) =>
				layers[utility] ? (
					<mesh
						key={utility}
						geometry={geometry}
						renderOrder={RENDER_ORDER.halos}
						raycast={noRaycast}
					>
						<meshBasicMaterial
							color={UTILITY_COLORS[utility]}
							transparent
							opacity={OPACITY.halo}
							depthWrite={false}
						/>
					</mesh>
				) : null,
			)}
		</group>
	);
}
