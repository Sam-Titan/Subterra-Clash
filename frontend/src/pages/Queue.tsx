import { Check, X } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useClashes, useGroups, useScene } from "@/api/hooks";
import {
	type Clash,
	REVIEW_STATUSES,
	type ReviewStatus,
	type Utility,
} from "@/api/types";
import { ErrorBlock, LoadingBlock } from "@/components/QueryState";
import { Switch } from "@/components/ui/switch";
import { EscalateDialog } from "@/features/clashes/EscalateDialog";
import { opportunityGroupIds } from "@/features/clashes/opportunity";
import { type QueueRow, QueueTable } from "@/features/clashes/QueueTable";
import { ReportExport } from "@/features/clashes/ReportExport";
import { REVIEW_STATUS_COLORS } from "@/lib/colors";
import { humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

/** SPEC §11, exact. */
const DISCLAIMER =
	"Decision-support output from synthetic data. Clearance values are illustrative. No permit has been approved or rejected by this tool; all findings require engineering review and field verification.";

const EMPTY_GROUPS: never[] = [];

export default function Queue() {
	const clashes = useClashes();
	const groups = useGroups();
	const scene = useScene();
	const navigate = useNavigate();
	const selectClash = useAppStore((s) => s.selectClash);
	const statusFilter = useAppStore((s) => s.queueStatusFilter);
	const toggleStatus = useAppStore((s) => s.toggleQueueStatus);
	const resetStatus = useAppStore((s) => s.resetQueueStatus);
	const grouped = useAppStore((s) => s.queueGrouped);
	const setGrouped = useAppStore((s) => s.setQueueGrouped);
	const intakeResult = useAppStore((s) => s.intakeResult);
	const groupedId = useId();

	const [escalating, setEscalating] = useState<Clash | null>(null);
	const [escalated, setEscalated] = useState<Clash | null>(null);

	const groupList = groups.data?.items ?? EMPTY_GROUPS;
	const all = clashes.data?.items;

	/** Every clash in review order: group rank, then severity (highest first). */
	const allRows = useMemo<QueueRow[]>(() => {
		const rankOf = new Map(groupList.map((g) => [g.id, g.review_rank]));
		return (all ?? [])
			.map((clash) => ({ clash, rank: rankOf.get(clash.group_id) }))
			.sort(
				(a, b) =>
					(a.rank ?? Number.POSITIVE_INFINITY) -
						(b.rank ?? Number.POSITIVE_INFINITY) ||
					b.clash.severity.score - a.clash.severity.score,
			);
	}, [all, groupList]);

	const rows = useMemo(
		() => allRows.filter((r) => statusFilter.includes(r.clash.review.status)),
		[allRows, statusFilter],
	);
	const shownClashes = useMemo(() => rows.map((r) => r.clash), [rows]);

	const statusCounts = useMemo(() => {
		const counts = new Map<ReviewStatus, number>();
		for (const { clash } of allRows) {
			const s = clash.review.status;
			counts.set(s, (counts.get(s) ?? 0) + 1);
		}
		return counts;
	}, [allRows]);

	const groupTotals = useMemo(() => {
		const totals = new Map<string, number>();
		for (const { clash } of allRows) {
			totals.set(clash.group_id, (totals.get(clash.group_id) ?? 0) + 1);
		}
		return totals;
	}, [allRows]);

	const opportunityGroups = useMemo(
		() => opportunityGroupIds(all ?? []),
		[all],
	);

	const assetUtility = useMemo(
		() =>
			new Map<string, Utility>(
				(scene.data?.assets ?? []).map((a) => [a.id, a.utility]),
			),
		[scene.data],
	);
	const freshIds = useMemo(
		() => new Set(intakeResult?.clashIds ?? []),
		[intakeResult],
	);

	const openInWorkspace = useCallback(
		(clash: Clash) => {
			selectClash(clash.id);
			navigate("/workspace");
		},
		[selectClash, navigate],
	);
	const startEscalate = useCallback((clash: Clash) => {
		setEscalated(null);
		setEscalating(clash);
	}, []);

	const total = allRows.length;
	const hidden = total - rows.length;
	const filterOff = statusFilter.length < REVIEW_STATUSES.length;

	return (
		<section className="flex flex-col gap-4 p-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h1 className="text-xl font-semibold">Review queue</h1>
					<p className="text-sm text-zinc-400">
						Probable conflicts grouped by clash group, highest review rank
						first. Open a clash to see its evidence in 3D.
					</p>
				</div>
				<ReportExport shown={shownClashes} groups={groupList} />
			</header>

			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				<fieldset className="flex flex-wrap items-center gap-1.5">
					<legend className="sr-only">Review status filter</legend>
					{REVIEW_STATUSES.map((status) => {
						const on = statusFilter.includes(status);
						return (
							<button
								key={status}
								type="button"
								aria-pressed={on}
								onClick={() => toggleStatus(status)}
								className={cn(
									"flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500",
									on
										? "border-zinc-600 bg-zinc-800 text-zinc-100"
										: "border-zinc-800 text-zinc-500 hover:text-zinc-300",
								)}
							>
								<span
									aria-hidden
									className="size-1.5 rounded-full"
									style={{
										backgroundColor: REVIEW_STATUS_COLORS[status],
										opacity: on ? 1 : 0.4,
									}}
								/>
								{humanizeEnum(status)}
								<span className="font-mono tabular-nums text-zinc-500">
									{statusCounts.get(status) ?? 0}
								</span>
							</button>
						);
					})}
				</fieldset>
				<div className="flex items-center gap-2 text-xs text-zinc-400">
					<Switch
						id={groupedId}
						checked={grouped}
						onCheckedChange={setGrouped}
					/>
					<label htmlFor={groupedId}>Group by clash group</label>
				</div>
				{clashes.isSuccess && (
					<span className="ml-auto text-xs text-zinc-500">
						<span className="font-mono tabular-nums">{rows.length}</span> of{" "}
						<span className="font-mono tabular-nums">{total}</span> shown
						{filterOff && (
							<>
								{" · "}
								{hidden} hidden by filter{" "}
								<button
									type="button"
									onClick={resetStatus}
									className="text-zinc-200 underline underline-offset-2 hover:text-zinc-50"
								>
									Show all
								</button>
							</>
						)}
					</span>
				)}
			</div>

			{escalated && (
				<p
					role="status"
					className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200"
				>
					<Check className="size-4 text-zinc-300" aria-hidden />
					<span>
						<span className="font-mono">{escalated.id}</span> escalated
						{escalated.review.reviewer && ` by ${escalated.review.reviewer}`}.
						{!statusFilter.includes("ESCALATED") &&
							" It is hidden by the status filter."}
					</span>
					<button
						type="button"
						onClick={() => setEscalated(null)}
						className="ml-auto rounded p-0.5 text-zinc-500 hover:text-zinc-200"
						aria-label="Dismiss message"
					>
						<X className="size-3.5" aria-hidden />
					</button>
				</p>
			)}

			{groups.isError && (
				<p className="text-xs text-zinc-500">
					Groups could not be loaded; ranks are missing and rows are listed by
					group id.
				</p>
			)}

			{clashes.isPending ? (
				<LoadingBlock label="Loading review queue…" />
			) : clashes.isError ? (
				<ErrorBlock
					title="Could not load the review queue"
					error={clashes.error}
					onRetry={() => clashes.refetch()}
				/>
			) : total === 0 ? (
				<p className="rounded-lg border border-zinc-800 p-6 text-sm text-zinc-400">
					No conflicts found in the current plan.
				</p>
			) : rows.length === 0 ? (
				<p className="rounded-lg border border-zinc-800 p-6 text-sm text-zinc-400">
					No clashes match these filters.{" "}
					<button
						type="button"
						onClick={resetStatus}
						className="text-zinc-200 underline underline-offset-2"
					>
						Show all
					</button>
				</p>
			) : (
				<div className="overflow-x-auto rounded-lg border border-zinc-800">
					<QueueTable
						rows={rows}
						groups={groupList}
						grouped={grouped}
						assetUtility={assetUtility}
						freshIds={freshIds}
						groupTotals={groupTotals}
						opportunityGroups={opportunityGroups}
						onOpen={openInWorkspace}
						onEscalate={startEscalate}
					/>
				</div>
			)}

			<p className="text-xs text-zinc-500">{DISCLAIMER}</p>

			<EscalateDialog
				clash={escalating}
				onClose={() => setEscalating(null)}
				onEscalated={(clash) => {
					setEscalating(null);
					setEscalated(clash);
				}}
			/>
		</section>
	);
}
