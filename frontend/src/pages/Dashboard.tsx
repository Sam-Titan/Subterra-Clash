import type { ReactNode } from "react";
import { useSummary } from "@/api/hooks";
import type { Summary } from "@/api/types";
import { NumberTicker } from "@/components/NumberTicker";
import {
	ErrorBlock,
	SkeletonRows,
	SkeletonTiles,
} from "@/components/QueryState";
import { cardClass } from "@/components/ui/card";
import {
	BreakdownChart,
	type BreakdownRow,
} from "@/features/dashboard/BreakdownChart";
import { CasesTable, ScoreTable } from "@/features/dashboard/EvaluationTable";
import { CERTAINTY_COLORS, UTILITY_COLORS } from "@/lib/colors";
import { humanizeEnum, utilityLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * SPEC §10.5. Every number is the API's (`GET /api/summary`): counts follow
 * the server's unresolved rule, precision and recall are shown as sent.
 */
export default function Dashboard() {
	const summary = useSummary();

	return (
		<section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
			<header>
				<h1 className="text-xl font-semibold">Dashboard</h1>
				<p className="mt-1 text-sm text-zinc-400">
					Counts cover unresolved clashes: review status Open or Escalated.
					Acknowledged and dismissed clashes drop out.
				</p>
			</header>
			{summary.isPending ? (
				<div className="flex flex-col gap-6">
					<SkeletonTiles
						count={4}
						label="Loading summary…"
						className="grid-cols-2 lg:grid-cols-4"
					/>
					<SkeletonRows rows={6} />
				</div>
			) : summary.isError ? (
				<ErrorBlock
					title="Could not load the summary"
					error={summary.error}
					onRetry={() => summary.refetch()}
				/>
			) : (
				<DashboardBody summary={summary.data} />
			)}
		</section>
	);
}

function DashboardBody({ summary }: { summary: Summary }) {
	const { counts, evaluation } = summary;

	const byUtility: BreakdownRow[] = summary.by_utility.map((r) => ({
		key: r.utility,
		label: utilityLabel(r.utility),
		count: r.count,
		color: UTILITY_COLORS[r.utility],
	}));
	const byCertainty: BreakdownRow[] = summary.by_certainty.map((r) => ({
		key: r.certainty,
		label: humanizeEnum(r.certainty),
		count: r.count,
		color: CERTAINTY_COLORS[r.certainty],
	}));

	return (
		<>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat label="Unresolved clashes" value={counts.open} />
				<Stat label="Critical" value={counts.critical} />
				<Stat label="Needs data" value={counts.needs_data} />
				<Stat label="Dig-once opportunities" value={counts.dig_once} />
			</div>
			<p className="-mt-3 text-xs text-zinc-400">
				Also unresolved: {counts.high} high severity · {counts.schedule_overlap}{" "}
				schedule overlap
				{counts.schedule_overlap === 1 ? "" : "s"}
			</p>

			{/* The result judges look for comes first: ours against the naive 2D
			    baseline, then where the unresolved clashes sit, then each case. */}
			<Panel
				title="Ours vs baseline"
				note="Precision and recall cover the planted spatial cases only, computed on all engine output whatever its review status."
			>
				<ScoreTable ours={evaluation.ours} baseline={evaluation.baseline} />
			</Panel>

			<div className="grid gap-4 lg:grid-cols-2">
				<Panel
					title="Unresolved by utility"
					note="One count per affected asset utility; schedule clashes have no assets."
				>
					<BreakdownChart rows={byUtility} ariaLabel="Unresolved by utility" />
				</Panel>
				<Panel title="Unresolved by certainty">
					<BreakdownChart
						rows={byCertainty}
						ariaLabel="Unresolved by certainty"
					/>
				</Panel>
			</div>

			<Panel
				title="Planted cases"
				note="The baseline is a naive 2D overlay: footprint touches the asset line, no depth, clearance, uncertainty or schedule."
			>
				<CasesTable cases={evaluation.cases} />
			</Panel>
		</>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className={cn(cardClass, "p-4")}>
			<p className="text-xs font-medium text-zinc-400">{label}</p>
			<NumberTicker
				value={value}
				className="mt-1 block text-3xl font-semibold tabular-nums text-zinc-100"
			/>
		</div>
	);
}

function Panel({
	title,
	note,
	children,
}: {
	title: string;
	note?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn(cardClass, "flex min-w-0 flex-col gap-3 p-4")}>
			<div>
				<h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
				{note && <p className="mt-0.5 text-xs text-zinc-400">{note}</p>}
			</div>
			{children}
		</div>
	);
}
