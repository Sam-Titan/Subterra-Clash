import { useSummary } from "@/api/hooks";
import { ErrorBlock, LoadingBlock } from "@/components/QueryState";
import { formatPercent } from "@/lib/format";

// Placeholder; tickers, charts and the full baseline table come in 3D.
export default function Dashboard() {
	const summary = useSummary();

	return (
		<section className="flex flex-col gap-4 p-6">
			<h1 className="text-xl font-semibold">Dashboard</h1>
			{summary.isPending ? (
				<LoadingBlock label="Loading summary…" />
			) : summary.isError ? (
				<ErrorBlock
					title="Could not load the summary"
					error={summary.error}
					onRetry={() => summary.refetch()}
				/>
			) : (
				<dl className="grid max-w-md grid-cols-2 gap-2 text-sm">
					<dt className="text-zinc-400">Open clashes</dt>
					<dd>{summary.data.counts.open}</dd>
					<dt className="text-zinc-400">Critical</dt>
					<dd>{summary.data.counts.critical}</dd>
					<dt className="text-zinc-400">Needs data</dt>
					<dd>{summary.data.counts.needs_data}</dd>
					<dt className="text-zinc-400">Precision (ours / baseline)</dt>
					<dd>
						{formatPercent(summary.data.evaluation.ours.precision)} /{" "}
						{formatPercent(summary.data.evaluation.baseline.precision)}
					</dd>
					<dt className="text-zinc-400">Recall (ours / baseline)</dt>
					<dd>
						{formatPercent(summary.data.evaluation.ours.recall)} /{" "}
						{formatPercent(summary.data.evaluation.baseline.recall)}
					</dd>
				</dl>
			)}
		</section>
	);
}
