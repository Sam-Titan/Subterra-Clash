import { create } from "zustand";
import { CERTAINTIES, type Certainty, type Utility } from "@/api/types";

export type LayerId = Utility | "WORKS";

const ALL_LAYERS: Record<LayerId, boolean> = {
	WATER: true,
	SEWER: true,
	POWER: true,
	TELECOM: true,
	GAS: true,
	WORKS: true,
};

interface AppState {
	selectedClashId: string | null;
	layers: Record<LayerId, boolean>;
	xray: boolean;
	halos: boolean;
	certaintyFilter: Certainty[];
	/** ISO date; null = no date filter. */
	dateFilter: string | null;

	selectClash: (id: string | null) => void;
	toggleLayer: (layer: LayerId) => void;
	setLayer: (layer: LayerId, visible: boolean) => void;
	setXray: (on: boolean) => void;
	setHalos: (on: boolean) => void;
	toggleCertainty: (certainty: Certainty) => void;
	setDateFilter: (date: string | null) => void;
	resetFilters: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
	selectedClashId: null,
	layers: { ...ALL_LAYERS },
	xray: true,
	halos: true,
	certaintyFilter: [...CERTAINTIES],
	dateFilter: null,

	selectClash: (id) => set({ selectedClashId: id }),
	toggleLayer: (layer) =>
		set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
	setLayer: (layer, visible) =>
		set((s) => ({ layers: { ...s.layers, [layer]: visible } })),
	setXray: (on) => set({ xray: on }),
	setHalos: (on) => set({ halos: on }),
	toggleCertainty: (certainty) =>
		set((s) => ({
			certaintyFilter: s.certaintyFilter.includes(certainty)
				? s.certaintyFilter.filter((c) => c !== certainty)
				: [...s.certaintyFilter, certainty],
		})),
	setDateFilter: (date) => set({ dateFilter: date }),
	resetFilters: () =>
		set({
			layers: { ...ALL_LAYERS },
			certaintyFilter: [...CERTAINTIES],
			dateFilter: null,
		}),
}));
