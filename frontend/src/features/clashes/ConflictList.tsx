import { useMemo } from "react";
import { useClashes, useGroups } from "@/api/hooks";
import type { Clash, ClashGroup } from "@/api/types";
import { ErrorBlock, SkeletonRows } from "@/components/QueryState";
import {
	INTAKE_COLORS,
	REVIEW_STATUS_COLORS,
	SEVERITY_BAND_COLORS,
} from "@/lib/colors";
import { formatScore, humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { CertaintyGlyph } from "./CertaintyGlyph";
import { compactClearance } from "./clearance";
import { OpportunityChip, opportunityGroupIds } from "./opportunity";

interface Section {
	key: string;
	rank: number | null;
	title: string;
	clashes: Clash[];
	/** Every clash in the group is DIG_ONCE: a coordination chance, not a conflict. */
	opportunity: boolean;
}

/** Compact workspace list, grouped by clash group in review order. */
export function ConflictList() {
	const clashes = useClashes();
	const groups = useGroups();
	const certaintyFilter = useAppStore((s) => s.certaintyFilter);
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const selectClash = useAppStore((s) => s.selectClash);
	const intakeResult = useAppStore((s) => s.intakeResult);
	const fresh = useMemo(
		() => new Set(intakeResult?.clashIds ?? []),
		[intakeResult],
	);

	const all = clashes.data?.items;
	const visible = useMemo(
		() => (all ?? []).filter((c) => certaintyFilter.includes(c.certainty)),
		[all, certaintyFilter],
	);

	const sections = useMemo<Section[]>(() => {
		const byGroup = new Map<string, Clash[]>();
		for (const c of visible) {
			const list = byGroup.get(c.group_id) ?? [];
			list.push(c);
			byGroup.set(c.group_id, list);
		}
		const opportunities = opportunityGroupIds(all ?? []);
		const ordered: ClashGroup[] = [...(groups.data?.items ?? [])].sort(
			(a, b) => a.review_rank - b.review_rank,
		);
		const result: Section[] = [];
		for (const g of ordered) {
			const list = byGroup.get(g.id);
			if (!list) continue;
			result.push({
				key: g.id,
				rank: g.review_rank,
				title: g.title,
				clashes: list,
				opportunity: opportunities.has(g.id),
			});
			byGroup.delete(g.id);
		}
		// Clashes whose group is not (yet) in /groups still get listed.
		for (const [id, list] of byGroup) {
			result.push({
				key: id,
				rank: null,
				title: id,
				clashes: list,
				opportunity: opportunities.has(id),
			});
		}
		return result;
	}, [all, visible, groups.data]);

	if (clashes.isPending)
		return <SkeletonRows rows={8} label="Loading conflicts…" />;
	if (clashes.isError) {
		return (
			<ErrorBlock
				title="Could not load conflicts"
				error={clashes.error}
				onRetry={() => clashes.refetch()}
			/>
		);
	}

	const total = clashes.data.items.length;
	const hidden = total - visible.length;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-baseline justify-between">
				<h2 className="text-sm font-semibold">Conflicts</h2>
				<span className="font-mono text-xs tabular-nums text-zinc-400">
					{visible.length} of {total}
				</span>
			</div>
			{hidden > 0 && (
				<p className="text-xs text-zinc-400">
					{hidden} hidden by the certainty filter.
				</p>
			)}
			{groups.isPending && (
				<p className="text-xs text-zinc-400">Loading clash groups…</p>
			)}
			{groups.isError && (
				<p className="flex flex-wrap items-center gap-1 text-xs text-zinc-400">
					Groups could not be loaded; showing clashes by group id.
					<button
						type="button"
						onClick={() => groups.refetch()}
						className="text-zinc-300 underline underline-offset-2"
					>
						Retry
					</button>
				</p>
			)}
			{total === 0 && (
				<p className="text-sm text-zinc-400">No conflicts found.</p>
			)}

			{sections.map((section) => (
				<section key={section.key} className="flex flex-col gap-1">
					<h3 className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
						<span className="flex gap-1.5">
							{section.rank !== null && (
								<span className="font-mono">#{section.rank}</span>
							)}
							{/* The title carries the count and the highest band: let it wrap. */}
							<span className="min-w-0 break-words">{section.title}</span>
						</span>
						{section.opportunity && (
							<span>
								<OpportunityChip />
							</span>
						)}
					</h3>
					<ul className="flex flex-col">
						{section.clashes.map((clash) => (
							<li key={clash.id}>
								<button
									type="button"
									onClick={() => selectClash(clash.id)}
									aria-current={clash.id === selectedClashId}
									className={cn(
										"grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500",
										clash.id === selectedClashId && "bg-zinc-800",
									)}
								>
									<CertaintyGlyph certainty={clash.certainty} />
									<span className="flex min-w-0 items-baseline gap-2">
										<span className="font-mono text-xs">{clash.id}</span>
										{fresh.has(clash.id) && (
											<span
												className="rounded-full border px-1.5 text-xs leading-4"
												style={{
													borderColor: INTAKE_COLORS.newClashRing,
													color: INTAKE_COLORS.newClashRing,
												}}
											>
												New
											</span>
										)}
										<span className="truncate text-xs text-zinc-400">
											{humanizeEnum(clash.kind)}
										</span>
									</span>
									<span
										className={cn(
											"text-xs tabular-nums",
											clash.severity.band === "INFO"
												? "font-normal"
												: "font-mono font-semibold",
										)}
										style={{
											color: SEVERITY_BAND_COLORS[clash.severity.band],
										}}
										title={`Severity ${humanizeEnum(clash.severity.band)}`}
									>
										{/* INFO (dig-once) is an opportunity: no alarming score. */}
										{clash.severity.band === "INFO"
											? "Info"
											: formatScore(clash.severity.score)}
									</span>
									<span />
									<span className="font-mono text-xs tabular-nums text-zinc-400">
										{compactClearance(clash)}
									</span>
									{/* Open is the default: only a reviewed status is worth a word. */}
									{clash.review.status === "OPEN" ? (
										<span />
									) : (
										<span
											className="flex items-center gap-1 text-xs text-zinc-400"
											title={`Review: ${humanizeEnum(clash.review.status)}`}
										>
											<span
												aria-hidden
												className="size-1.5 rounded-full"
												style={{
													backgroundColor:
														REVIEW_STATUS_COLORS[clash.review.status],
												}}
											/>
											{humanizeEnum(clash.review.status)}
										</span>
									)}
								</button>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
