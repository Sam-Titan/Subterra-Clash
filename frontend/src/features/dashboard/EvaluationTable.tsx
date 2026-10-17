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
					<TableHead className="text-zinc-400">Spatial cases</TableHead>
					<TableHead className="text-right text-zinc-200">
						Subterra Clash
					</TableHead>
					<TableHead className="text-right text-zinc-400">
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
						<TableCell className="py-2 text-zinc-400">{m.label}</TableCell>
						<TableCell className="py-2 text-right font-medium tabular-nums text-zinc-100">
							{m.format(ours[m.key])}
						</TableCell>
						<TableCell className="py-2 text-right tabular-nums text-zinc-400">
							{m.format(baseline[m.key])}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/**
 * Planted T-cases: our result (verdict, outcome and certainty) against the
 * baseline. The expectation is only spelled out when ours differs from it.
 */
export function CasesTable({ cases }: { cases: EvaluationCase[] }) {
	if (cases.length === 0)
		return <p className="text-sm text-zinc-400">No planted cases reported.</p>;
	return (
		<Table>
			<TableHeader>
				<TableRow className="border-zinc-800 hover:bg-transparent">
					<TableHead className="w-12 text-zinc-400">Case</TableHead>
					<TableHead className="text-zinc-400">Setup</TableHead>
					<TableHead className="text-zinc-400">Result</TableHead>
					<TableHead className="text-zinc-400">Baseline</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{cases.map((c) => {
					const verdict = caseVerdict(c);
					const Icon = VERDICT_ICON[verdict.status];
					return (
						<TableRow
							key={c.case_id}
							className="border-zinc-800 hover:bg-zinc-900/40"
						>
							<TableCell className="py-2 font-mono text-zinc-300">
								{c.case_id}
							</TableCell>
							<TableCell className="min-w-56 whitespace-normal py-2 text-zinc-400">
								{c.description}
							</TableCell>
							<TableCell className="py-2 text-xs">
								<div className="flex flex-col gap-0.5">
									<span
										className="inline-flex items-center gap-1.5 whitespace-nowrap"
										style={{ color: VERDICT_COLORS[verdict.status] }}
									>
										<Icon className="size-3.5 shrink-0" aria-hidden />
										<span>{verdict.label}</span>
										<span className="font-mono text-zinc-100">
											· {formatOutcome(c.ours, c.ours_certainty)}
										</span>
									</span>
									{verdict.status !== "pass" && (
										<span className="font-mono whitespace-nowrap text-zinc-400">
											Expected {formatOutcome(c.expected, c.expected_certainty)}
										</span>
									)}
								</div>
							</TableCell>
							<TableCell className="py-2 text-xs">
								<VerdictMark verdict={baselineVerdict(c)} />
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
