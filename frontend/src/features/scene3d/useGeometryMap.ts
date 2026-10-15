import { useEffect, useMemo } from "react";
import type { BufferGeometry } from "three";

/**
 * Memoised map of geometries (built once per input), disposed when the inputs
 * change or the component unmounts. Keeps GPU memory from leaking on refetch.
 */
export function useGeometryMap<K extends string>(
	build: () => Map<K, BufferGeometry>,
	deps: readonly unknown[],
): Map<K, BufferGeometry> {
	// biome-ignore lint/correctness/useExhaustiveDependencies: caller supplies deps
	const geometries = useMemo(build, deps);
	useEffect(
		() => () => {
			for (const g of geometries.values()) g.dispose();
		},
		[geometries],
	);
	return geometries;
}
