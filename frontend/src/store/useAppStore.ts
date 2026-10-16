import { create } from "zustand";
import {
	CERTAINTIES,
	type Certainty,
	REVIEW_STATUSES,
	type ReviewStatus,
	type Utility,
} from "@/api/types";
import type { SectionState } from "@/features/section/sectionGeometry";

/** Utilities, proposed works and the generated city context (roads, buildings). */
export type LayerId = Utility | "WORKS" | "CITY";

/** Camera preset; "free" once the user orbits or a clash fly-to takes over. */
export type ViewMode = "overview" | "street" | "free";

/** Tabs of the workspace bottom dock. */
export type DockTab = "section" | "schedule";

const ALL_LAYERS: Record<LayerId, boolean> = {
	WATER: true,
	SEWER: true,
	POWER: true,
	TELECOM: true,
	GAS: true,
	WORKS: true,
	CITY: true,
};

interface AppState {
	selectedClashId: string | null;
	layers: Record<LayerId, boolean>;
	xray: boolean;
	halos: boolean;
	certaintyFilter: Certainty[];
	/** ISO date (YYYY-MM-DD) from the schedule scrubber; null = no date filter. */
	dateFilter: string | null;
	/** Name recorded on review decisions (no auth in this tool). */
	reviewerName: string;
	/** Section plane + cross-section panel shown. */
	sectionEnabled: boolean;
	/** The user has used the section switch; stop auto-enabling it. */
	sectionTouched: boolean;
	/** Bottom dock (cross-section + schedule tabs) shrunk to its bar. */
	dockCollapsed: boolean;
	/** Requested dock tab; "section" falls back to schedule while the section is off. */
	dockTab: DockTab;
	/** null = default (first street at its midpoint). */
	section: SectionState | null;
	/** Latest permit added to the plan; its clashes are highlighted in the workspace. */
	intakeResult: IntakeResult | null;
	/** Current camera preset (SPEC §10.2 street level / overview). */
	viewMode: ViewMode;
	/** Street for the street-level view; null = default (Station Road / first). */
	streetViewId: string | null;
	/** Bumped on every preset request so the camera rig animates once per click. */
	viewNonce: number;
	/** Review statuses shown in the queue. */
	queueStatusFilter: ReviewStatus[];
	/** Queue rows split into clash-group sections (else one flat list). */
	queueGrouped: boolean;

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
	setDockCollapsed: (collapsed: boolean) => void;
	setDockTab: (tab: DockTab) => void;
	setSection: (section: SectionState) => void;
	setIntakeResult: (result: IntakeResult | null) => void;
	/** Street level also turns x-ray off, so the reveal is one click away. */
	requestView: (mode: "overview" | "street") => void;
	setStreetViewId: (id: string) => void;
	/** The camera left the preset (drag, fly-to); does not move it. */
	releaseView: () => void;
	toggleQueueStatus: (status: ReviewStatus) => void;
	resetQueueStatus: () => void;
	setQueueGrouped: (grouped: boolean) => void;
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
	dockCollapsed: false,
	dockTab: "schedule",
	section: null,
	setSectionEnabled: (on) => set({ sectionEnabled: on, sectionTouched: true }),
	autoEnableSection: () =>
		set((s) =>
			s.sectionTouched ? {} : { sectionEnabled: true, sectionTouched: true },
		),
	setDockCollapsed: (collapsed) => set({ dockCollapsed: collapsed }),
	setDockTab: (tab) => set({ dockTab: tab }),
	setSection: (section) => set({ section }),
	intakeResult: null,
	setIntakeResult: (result) => set({ intakeResult: result }),
	viewMode: "overview",
	streetViewId: null,
	viewNonce: 0,
	requestView: (mode) =>
		set((s) => ({
			viewMode: mode,
			viewNonce: s.viewNonce + 1,
			...(mode === "street" ? { xray: false } : {}),
		})),
	setStreetViewId: (id) => set({ streetViewId: id }),
	releaseView: () =>
		set((s) => (s.viewMode === "free" ? {} : { viewMode: "free" })),
	queueStatusFilter: [...REVIEW_STATUSES],
	queueGrouped: true,
	toggleQueueStatus: (status) =>
		set((s) => ({
			queueStatusFilter: s.queueStatusFilter.includes(status)
				? s.queueStatusFilter.filter((x) => x !== status)
				: [...s.queueStatusFilter, status],
		})),
	resetQueueStatus: () => set({ queueStatusFilter: [...REVIEW_STATUSES] }),
	setQueueGrouped: (grouped) => set({ queueGrouped: grouped }),
}));
