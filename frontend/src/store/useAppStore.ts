import { create } from "zustand";
import { CERTAINTIES, type Certainty, type Utility } from "@/api/types";
import type { SectionState } from "@/features/section/sectionGeometry";

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
	/** Name recorded on review decisions (no auth in this tool). */
	reviewerName: string;
	/** Section plane + cross-section panel shown. */
	sectionEnabled: boolean;
	/** The user has used the section switch; stop auto-enabling it. */
	sectionTouched: boolean;
	sectionCollapsed: boolean;
	/** null = default (first street at its midpoint). */
	section: SectionState | null;
	/** Latest permit added to the plan; its clashes are highlighted in the workspace. */
	intakeResult: IntakeResult | null;

	selectClash: (id: string | null) => void;
	toggleLayer: (layer: LayerId) => void;
	setLayer: (layer: LayerId, visible: boolean) => void;
	setXray: (on: boolean) => void;
	setHalos: (on: boolean) => void;
	toggleCertainty: (certainty: Certainty) => void;
	setDateFilter: (date: string | null) => void;
	resetFilters: () => void;
	setReviewerName: (name: string) => void;
	/** From the user (rail switch, panel close): also marks the switch touched. */
	setSectionEnabled: (on: boolean) => void;
	/** First clash selection: turn the section on unless the user decided already. */
	autoEnableSection: () => void;
	setSectionCollapsed: (collapsed: boolean) => void;
	setSection: (section: SectionState) => void;
	setIntakeResult: (result: IntakeResult | null) => void;
}

export interface IntakeResult {
	workId: string;
	permitNo: string;
	clashIds: string[];
	/** The draft's `preview_clash_count` just before commit. */
	previewCount: number;
}

export const useAppStore = create<AppState>()((set) => ({
	selectedClashId: null,
	layers: { ...ALL_LAYERS },
	xray: true,
	halos: true,
	certaintyFilter: [...CERTAINTIES],
	dateFilter: null,
	reviewerName: "A. Sharma",

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
	setReviewerName: (name) => set({ reviewerName: name }),
	sectionEnabled: false,
	sectionTouched: false,
	sectionCollapsed: false,
	section: null,
	setSectionEnabled: (on) => set({ sectionEnabled: on, sectionTouched: true }),
	autoEnableSection: () =>
		set((s) =>
			s.sectionTouched ? {} : { sectionEnabled: true, sectionTouched: true },
		),
	setSectionCollapsed: (collapsed) => set({ sectionCollapsed: collapsed }),
	setSection: (section) => set({ section }),
	intakeResult: null,
	setIntakeResult: (result) => set({ intakeResult: result }),
}));
