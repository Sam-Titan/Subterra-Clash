import { useEffect, useMemo, useRef } from "react";
import type { Clash, Scene } from "@/api/types";
import { useAppStore } from "@/store/useAppStore";
import {
	cutScene,
	type SectionCut,
	type SectionState,
	snapSectionToClash,
	streetSection,
} from "./sectionGeometry";

/** The stored section, or the default: across the first street at its midpoint. */
export function useResolvedSection(
	scene: Scene | undefined,
): SectionState | null {
	const stored = useAppStore((s) => s.section);
	return useMemo(() => {
		if (stored) return stored;
		const street = scene?.streets[0];
		return street ? streetSection(street) : null;
	}, [stored, scene]);
}

/** The cut through the scene, filtered by the same layer toggles as the 3D view. */
export function useSectionCut(
	scene: Scene | undefined,
	section: SectionState | null,
): SectionCut | null {
	const layers = useAppStore((s) => s.layers);
	return useMemo(() => {
		if (!scene || !section) return null;
		return cutScene(scene, section, {
			utilities: (u) => layers[u],
			works: layers.WORKS,
		});
	}, [scene, section, layers]);
}

/**
 * Snaps the section to the selected clash whenever the selected id changes
 * (not on refetch). The first selection also turns the section on, unless the
 * user has already used the switch. Each new selection brings the
 * cross-section tab of the bottom dock to the front.
 */
export function useSectionFollowsSelection(
	scene: Scene | undefined,
	clashes: Clash[],
) {
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const setSection = useAppStore((s) => s.setSection);
	const autoEnableSection = useAppStore((s) => s.autoEnableSection);
	const setDockTab = useAppStore((s) => s.setDockTab);
	const snappedFor = useRef<string | null>(null);

	useEffect(() => {
		if (selectedClashId === null) {
			snappedFor.current = null;
			return;
		}
		if (!scene || snappedFor.current === selectedClashId) return;
		const clash = clashes.find((c) => c.id === selectedClashId);
		if (!clash) return; // retried when clashes arrive
		snappedFor.current = selectedClashId;
		const snapped = snapSectionToClash(scene, clash);
		if (snapped) setSection(snapped);
		autoEnableSection();
		setDockTab("section");
	}, [
		selectedClashId,
		scene,
		clashes,
		setSection,
		autoEnableSection,
		setDockTab,
	]);
}
