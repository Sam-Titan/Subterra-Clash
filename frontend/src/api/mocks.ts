// Mock mode (VITE_USE_MOCKS=true): answers from ../shared/mocks, which follow
// docs/API_CONTRACT.md. This module is only loaded through dynamic import(), so
// it is left out of the bundle when mocks are off.
//
// NOTE for 4B (Docker): these imports reach outside frontend/, so the frontend
// image build needs the repo root (with shared/) as its build context.
//
// shared/mocks has no groups, clash-detail or rules file, so those responses
// are derived here. Do not rely on mock counts or IDs.

import { ApiError } from "./client";
import type {
	Clash,
	ClashDetail,
	ClashGroup,
	ClashQuery,
	ListResponse,
	Scene,
	Summary,
} from "./types";

const MOCK_DELAY_MS = 300;

function delay<T>(value: T): Promise<T> {
	return new Promise((resolve) =>
		setTimeout(() => resolve(value), MOCK_DELAY_MS),
	);
}

async function loadScene(): Promise<Scene> {
	const mod = await import("../../../shared/mocks/scene.json");
	// JSON arrays widen to number[][], not tuples, so cast through unknown.
	return mod.default as unknown as Scene;
}

async function loadClashes(): Promise<ListResponse<Clash>> {
	const mod = await import("../../../shared/mocks/clashes.json");
	return mod.default as unknown as ListResponse<Clash>;
}

export async function mockScene(): Promise<Scene> {
	return delay(await loadScene());
}

export async function mockClashes(
	query: ClashQuery,
): Promise<ListResponse<Clash>> {
	const [{ items }, scene, groups] = await Promise.all([
		loadClashes(),
		loadScene(),
		deriveGroups(),
	]);
	const utilityOf = new Map(scene.assets.map((a) => [a.id, a.utility]));

	const filtered = items.filter(
		(c) =>
			(!query.kind || c.kind === query.kind) &&
			(!query.certainty || c.certainty === query.certainty) &&
			(!query.band || c.severity.band === query.band) &&
			(!query.status || c.review.status === query.status) &&
			(!query.utility ||
				c.asset_ids.some((id) => utilityOf.get(id) === query.utility)) &&
			(!query.work_id || c.work_ids.includes(query.work_id)) &&
			(!query.group_id || c.group_id === query.group_id),
	);

	const rankOf = new Map(groups.map((g) => [g.id, g.review_rank]));
	const sort = query.sort ?? "review_rank";
	const sorted = [...filtered].sort((a, b) => {
		if (sort === "id") return a.id.localeCompare(b.id);
		if (sort === "review_rank") {
			const byRank =
				(rankOf.get(a.group_id) ?? Number.MAX_SAFE_INTEGER) -
				(rankOf.get(b.group_id) ?? Number.MAX_SAFE_INTEGER);
			if (byRank !== 0) return byRank;
		}
		return b.severity.score - a.severity.score || a.id.localeCompare(b.id);
	});

	return delay({ items: sorted, total: sorted.length });
}

export async function mockClash(id: string): Promise<ClashDetail> {
	const [{ items }, scene] = await Promise.all([loadClashes(), loadScene()]);
	const clash = items.find((c) => c.id === id);
	if (!clash) {
		throw new ApiError(404, "NOT_FOUND", `Clash ${id} not found.`);
	}
	return delay({
		clash,
		assets: scene.assets.filter((a) => clash.asset_ids.includes(a.id)),
		works: scene.works.filter((w) => clash.work_ids.includes(w.id)),
		rule: null, // no rules mock; the real API always sends the rule
	});
}

async function deriveGroups(): Promise<ClashGroup[]> {
	const { items } = await loadClashes();
	const byGroup = new Map<string, Clash[]>();
	for (const clash of items) {
		const list = byGroup.get(clash.group_id) ?? [];
		list.push(clash);
		byGroup.set(clash.group_id, list);
	}
	const groups = [...byGroup.entries()].map(([id, clashes]) => ({
		id,
		title: `${id} — ${clashes.length} clash${clashes.length === 1 ? "" : "es"}`,
		clash_ids: clashes.map((c) => c.id),
		work_ids: [...new Set(clashes.flatMap((c) => c.work_ids))],
		max_severity_score: Math.max(...clashes.map((c) => c.severity.score)),
		review_rank: 0,
	}));
	groups.sort(
		(a, b) =>
			b.max_severity_score - a.max_severity_score || a.id.localeCompare(b.id),
	);
	return groups.map((g, i) => ({ ...g, review_rank: i + 1 }));
}

export async function mockGroups(): Promise<ListResponse<ClashGroup>> {
	const items = await deriveGroups();
	return delay({ items, total: items.length });
}

export async function mockSummary(): Promise<Summary> {
	const mod = await import("../../../shared/mocks/summary.json");
	return delay(mod.default as unknown as Summary);
}
