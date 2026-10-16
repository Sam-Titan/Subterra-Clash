import { Check, CircleHelp, Minus, X } from "lucide-react";
import type { EvaluationCase, EvaluationScore } from "@/api/types";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { VERDICT_COLORS } from "@/lib/colors";
import { formatPercent } from "@/lib/format";
import {
	baselineVerdict,
	caseVerdict,
	formatOutcome,
	type Verdict,
} from "./evaluation";

const VERDICT_ICON = {
	pass: Check,
	fail: X,
	na: Minus,
	unknown: CircleHelp,
} as const;

function VerdictMark({ verdict }: { verdict: Verdict }) {
	const Icon = VERDICT_ICON[verdict.status];
	return (
		<span
			className="inline-flex items-center gap-1.5 whitespace-nowrap"
			style={{ color: VERDICT_COLORS[verdict.status] }}
		>
			<Icon className="size-3.5 shrink-0" aria-hidden />
			<span className={verdict.status === "unknown" ? "font-mono" : undefined}>
				{verdict.label}
			</span>
		</span>
	);
}

const METRICS: {
	key: keyof EvaluationScore;
	label: string;
	format: (v: number) => string;
}[] = [
	{ key: "true_positives", label: "Found", format: String },
	{ key: "false_alarms", label: "False alarms", format: String },
	{ key: "misses", label: "Misses", format: String },
	{ key: "precision", label: "Precision", format: (v) => formatPercent(v) },
	{ key: "recall", label: "Recall", format: (v) => formatPercent(v) },
];

/** Precision / recall exactly as the API sent them. */
export function ScoreTable({
	ours,
	baseline,
}: {
	ours: EvaluationScore;
	baseline: EvaluationScore;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow className="border-zinc-800 hover:bg-transparent">
					<TableHead className="text-zinc-500">Spatial cases</TableHead>
					<TableHead className="text-right text-zinc-200">
						Subterra Clash
					</TableHead>
					<TableHead className="text-right text-zinc-500">
						Naive 2D overlay
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{METRICS.map((m) => (
					<TableRow
						key={m.key}
						className="border-zinc-800 hover:bg-zinc-900/40"
					>
						<TableCell className="text-zinc-400">{m.label}</TableCell>
						<TableCell className="text-right font-medium tabular-nums text-zinc-100">
							{m.format(ours[m.key])}
						</TableCell>
						<TableCell className="text-right tabular-nums text-zinc-400">
							{m.format(baseline[m.key])}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/** Planted T-cases: expected vs ours (kind · certainty) vs the baseline. */
export function CasesTable({ cases }: { cases: EvaluationCase[] }) {
	if (cases.length === 0)
		return <p className="text-sm text-zinc-500">No planted cases reported.</p>;
	return (
		<Table>
			<TableHeader>
				<TableRow className="border-zinc-800 hover:bg-transparent">
					<TableHead className="w-12 text-zinc-500">Case</TableHead>
					<TableHead className="text-zinc-500">Setup</TableHead>
					<TableHead className="text-zinc-500">Expected</TableHead>
					<TableHead className="text-zinc-500">Ours</TableHead>
					<TableHead className="text-zinc-500">Baseline</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{cases.map((c) => (
					<TableRow
						key={c.case_id}
						className="border-zinc-800 hover:bg-zinc-900/40"
					>
						<TableCell className="font-mono text-zinc-300">
							{c.case_id}
						</TableCell>
						<TableCell className="min-w-56 whitespace-normal text-zinc-400">
							{c.description}
						</TableCell>
						<TableCell className="font-mono text-xs whitespace-nowrap text-zinc-400">
							{formatOutcome(c.expected, c.expected_certainty)}
						</TableCell>
						<TableCell className="text-xs">
							<div className="flex flex-col gap-0.5">
								<span className="font-mono whitespace-nowrap text-zinc-100">
									{formatOutcome(c.ours, c.ours_certainty)}
								</span>
								<VerdictMark verdict={caseVerdict(c)} />
							</div>
						</TableCell>
						<TableCell className="text-xs">
							<VerdictMark verdict={baselineVerdict(c)} />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
