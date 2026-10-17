import { ChevronRight, EyeOff, X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { USE_MOCKS } from "@/api/client";
import { useClash, useReviewClash } from "@/api/hooks";
import type {
	Asset,
	Clash,
	ClashDetail,
	ReviewAction,
	Work,
} from "@/api/types";
import {
	describeError,
	ErrorBlock,
	SkeletonRows,
} from "@/components/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	FACTOR_COLORS,
	REVIEW_STATUS_COLORS,
	SEVERITY_BAND_COLORS,
	UTILITY_COLORS,
} from "@/lib/colors";
import {
	formatDate,
	formatDateRange,
	formatDateTime,
	formatGap,
	formatMetres,
	formatScore,
	formatUncertainty,
	humanizeEnum,
	MISSING,
	utilityLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { CertaintyBadge } from "./CertaintyGlyph";
import { FACTOR_LABELS, factorSegments } from "./factors";
import { toastReviewed } from "./reviewToast";

function SectionTitle({ children }: { children: ReactNode }) {
	return <h3 className="text-xs font-medium text-zinc-400">{children}</h3>;
}

/**
 * Native <details>: the summary is always visible, the rest is one click
 * away. Callers key it by clash so each clash starts from its own default.
 */
function Disclosure({
	title,
	hint,
	defaultOpen = false,
	children,
}: {
	title: string;
	hint?: string;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	return (
		<details open={defaultOpen} className="group border-t border-zinc-800">
			<summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-sm text-zinc-200 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-400 [&::-webkit-details-marker]:hidden">
				<ChevronRight
					className="size-4 text-zinc-400 transition-transform group-open:rotate-90"
					aria-hidden
				/>
				{title}
				{hint && <span className="ml-auto text-xs text-zinc-400">{hint}</span>}
			</summary>
			<div className="pb-3 pl-6">{children}</div>
		</details>
	);
}

/** A value that is `unknown` is shown as missing, never as 0. */
function Value({ text }: { text: string }) {
	const missing = text === MISSING;
	return (
		<span
			className={cn(
				"font-mono tabular-nums",
				missing &&
					"rounded border border-dashed border-zinc-600 px-1 italic text-zinc-400",
			)}
		>
			{text}
		</span>
	);
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs text-zinc-400">{label}</span>
			<Value text={value} />
		</div>
	);
}

function StatusBadge({ status }: { status: Clash["review"]["status"] }) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-200">
			<span
				aria-hidden
				className="size-2 rounded-full"
				style={{ backgroundColor: REVIEW_STATUS_COLORS[status] }}
			/>
			{humanizeEnum(status)}
		</span>
	);
}

function SeverityBlock({ clash }: { clash: Clash }) {
	const { severity } = clash;
	const segments = factorSegments(severity);
	return (
		<section className="flex flex-col gap-2">
			<SectionTitle>Severity</SectionTitle>
			<div className="flex items-baseline gap-2">
				<span
					className="font-mono text-3xl font-semibold tabular-nums"
					style={{ color: SEVERITY_BAND_COLORS[severity.band] }}
				>
					{formatScore(severity.score)}
				</span>
				<span className="text-sm text-zinc-400">
					/ 100 · {humanizeEnum(severity.band)}
				</span>
			</div>
			{clash.kind === "DIG_ONCE" && (
				<p className="text-xs text-zinc-400">
					Dig-once opportunities are always banded Info; the score still shows
					how the factors combine.
				</p>
			)}
			<div
				className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800"
				role="img"
				aria-label={segments
					.map((s) => `${FACTOR_LABELS[s.key]} ${s.points}`)
					.join(", ")}
			>
				{segments.map((s) => (
					<div
						key={s.key}
						style={{
							width: `${s.points}%`,
							backgroundColor: FACTOR_COLORS[s.key],
						}}
					/>
				))}
			</div>
		</section>
	);
}

function FactorList({ clash }: { clash: Clash }) {
	const segments = factorSegments(clash.severity);
	return (
		<ul className="grid grid-cols-1 gap-y-1 text-xs">
			{segments.map((s) => (
				<li key={s.key} className="flex items-center gap-1.5">
					<span
						aria-hidden
						className="size-2 shrink-0 rounded-sm"
						style={{ backgroundColor: FACTOR_COLORS[s.key] }}
					/>
					<span className="text-zinc-300">{FACTOR_LABELS[s.key]}</span>
					<span className="ml-auto font-mono tabular-nums text-zinc-400">
						{s.raw.toFixed(2)} × {s.weight.toFixed(2)} ={" "}
						<span className="text-zinc-200">{s.points}</span>
					</span>
				</li>
			))}
		</ul>
	);
}

function ClearanceBlock({ detail }: { detail: ClashDetail }) {
	const { clash, rule } = detail;
	const { x, y, z } = clash.location;
	let ruleText: string;
	if (rule) {
		ruleText = `${rule.label} (${rule.id}) — min ${formatMetres(rule.min_clearance_m)}`;
	} else if (clash.rule_id) {
		ruleText = USE_MOCKS
			? `${clash.rule_id} (rule details come from the live API)`
			: clash.rule_id;
	} else {
		ruleText = "No clearance rule applies (schedule finding).";
	}

	return (
		<section className="flex flex-col gap-2">
			<SectionTitle>Clearance</SectionTitle>
			{clash.schedule ? (
				<div className="grid grid-cols-2 gap-3 text-sm">
					<Field
						label="Overlap"
						value={`${clash.schedule.overlap_days} days`}
					/>
					<Field label="Gap" value={`${clash.schedule.gap_days} days`} />
				</div>
			) : (
				<div className="grid grid-cols-3 gap-3 text-sm">
					<Field label="Measured" value={formatGap(clash.measured_gap_m)} />
					<Field
						label="Required"
						value={formatMetres(clash.required_clearance_m)}
					/>
					<Field
						label="Uncertainty"
						value={formatUncertainty(clash.uncertainty_m)}
					/>
				</div>
			)}
			<p className="text-xs text-zinc-400">
				<span className="text-zinc-400">Rule: </span>
				{ruleText}
			</p>
			<p className="text-xs text-zinc-400">
				<span className="text-zinc-400">Location: </span>
				<span className="font-mono">
					x {x.toFixed(1)}, y {y.toFixed(1)} · depth{" "}
					{formatMetres(Math.max(0, -z))}
				</span>
			</p>
		</section>
	);
}

function AssetCard({ asset }: { asset: Asset }) {
	const record = asset.source_record;
	return (
		<li className="flex flex-col gap-1 rounded-md border border-zinc-800 p-2 text-xs">
			<div className="flex items-center gap-2">
				<span
					aria-hidden
					className="size-2.5 shrink-0 rounded-full"
					style={{ backgroundColor: UTILITY_COLORS[asset.utility] }}
				/>
				<span className="font-medium text-zinc-100">{asset.label}</span>
				<span className="ml-auto font-mono text-zinc-400">{asset.id}</span>
			</div>
			<div className="text-zinc-400">
				{utilityLabel(asset.utility)} · {asset.owner} · ⌀{" "}
				{formatMetres(asset.diameter_m)}
			</div>
			<div className="flex flex-wrap gap-x-3 text-zinc-400">
				<span>
					Depth:{" "}
					{asset.depth_known ? (
						<Value text={formatUncertainty(asset.depth_precision_m)} />
					) : (
						<Value text={MISSING} />
					)}
				</span>
				<span>
					Horizontal:{" "}
					<Value text={formatUncertainty(asset.horiz_precision_m)} />
				</span>
			</div>
			<div className="text-zinc-400">
				Source: {record.source} ·{" "}
				<span className="font-mono">{record.record_id}</span> ·{" "}
				{humanizeEnum(record.method)} · {formatDate(record.captured_on)}
			</div>
		</li>
	);
}

function WorkCard({ work }: { work: Work }) {
	return (
		<li className="flex flex-col gap-1 rounded-md border border-zinc-800 p-2 text-xs">
			<div className="flex items-center gap-2">
				<span className="font-medium text-zinc-100">{work.title}</span>
				<span className="ml-auto font-mono text-zinc-400">{work.id}</span>
			</div>
			<div className="text-zinc-400">
				{humanizeEnum(work.work_type)} · {work.agency}
			</div>
			<div className="text-zinc-400">
				Permit <span className="font-mono">{work.source_permit.permit_no}</span>{" "}
				· {formatDateRange(work.start_date, work.end_date)}
			</div>
			<div className="text-zinc-400">
				Depth {formatMetres(work.depth_from_m)} –{" "}
				{formatMetres(work.depth_to_m)}
			</div>
			{work.missing_fields.length > 0 && (
				<div className="text-zinc-400">
					Missing: <Value text={work.missing_fields.join(", ")} />
				</div>
			)}
		</li>
	);
}

const ACTIONS: { action: ReviewAction; label: string }[] = [
	{ action: "ACKNOWLEDGE", label: "Acknowledge" },
	{ action: "ESCALATE", label: "Escalate" },
	{ action: "DISMISS", label: "Dismiss finding" },
];

const STATUS_AFTER: Record<ReviewAction, Clash["review"]["status"]> = {
	ACKNOWLEDGE: "ACKNOWLEDGED",
	ESCALATE: "ESCALATED",
	DISMISS: "DISMISSED",
	REOPEN: "OPEN",
};

/** Keyed by clash id by the parent, so the note resets per clash. */
function ReviewBlock({ clash }: { clash: Clash }) {
	const reviewerName = useAppStore((s) => s.reviewerName);
	const setReviewerName = useAppStore((s) => s.setReviewerName);
	const [note, setNote] = useState("");
	const reviewerId = useId();
	const noteId = useId();
	const review = useReviewClash();
	const { status } = clash.review;
	const reviewer = reviewerName.trim();
	const hasNote = note.trim().length > 0;

	const submit = (action: ReviewAction) => {
		review.mutate(
			{
				id: clash.id,
				body: { action, reviewer, note: hasNote ? note.trim() : null },
			},
			{
				onSuccess: (res) => {
					setNote("");
					toastReviewed(res.clash);
				},
			},
		);
	};

	const error = review.isError ? describeError(review.error) : null;

	return (
		<section className="flex flex-col gap-2">
			<SectionTitle>Engineering review</SectionTitle>
			{clash.review.reviewer && (
				<p className="text-xs text-zinc-400">
					{humanizeEnum(status)} by {clash.review.reviewer} ·{" "}
					{formatDateTime(clash.review.updated_at)}
				</p>
			)}
			{clash.review.note && (
				<p className="rounded-md bg-zinc-900 p-2 text-xs text-zinc-300">
					“{clash.review.note}”
				</p>
			)}
			<p className="text-xs text-zinc-400">
				Review actions record an engineer's decision about this finding. They do
				not approve or reject any permit.
			</p>

			<label
				htmlFor={reviewerId}
				className="flex flex-col gap-1 text-xs text-zinc-400"
			>
				Reviewer
				<Input
					id={reviewerId}
					value={reviewerName}
					onChange={(e) => setReviewerName(e.target.value)}
					className="h-8 border-zinc-700 bg-zinc-900 text-sm text-zinc-100"
				/>
			</label>
			<label
				htmlFor={noteId}
				className="flex flex-col gap-1 text-xs text-zinc-400"
			>
				Note (required to dismiss)
				<Textarea
					id={noteId}
					value={note}
					onChange={(e) => setNote(e.target.value)}
					placeholder="e.g. Field check booked for 2 Nov"
					className="min-h-16 border-zinc-700 bg-zinc-900 text-sm text-zinc-100"
				/>
			</label>

			<div className="flex flex-wrap gap-2">
				{ACTIONS.map(({ action, label }) => (
					<Button
						key={action}
						size="sm"
						variant="outline"
						className="border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-800"
						disabled={
							review.isPending ||
							!reviewer ||
							status === STATUS_AFTER[action] ||
							(action === "DISMISS" && !hasNote)
						}
						onClick={() => submit(action)}
					>
						{label}
					</Button>
				))}
				{status !== "OPEN" && (
					<Button
						size="sm"
						variant="ghost"
						className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
						disabled={review.isPending || !reviewer}
						onClick={() => submit("REOPEN")}
					>
						Reopen
					</Button>
				)}
			</div>
			{!reviewer && (
				<p className="text-xs text-zinc-400">Enter a reviewer name.</p>
			)}
			{review.isPending && <p className="text-xs text-zinc-400">Saving…</p>}
			{error && (
				<p role="alert" className="text-xs text-zinc-300">
					{error.detail}{" "}
					<code className="font-mono text-zinc-400">{error.code}</code>
				</p>
			)}
		</section>
	);
}

function HiddenNotice({ clash }: { clash: Clash }) {
	const certaintyFilter = useAppStore((s) => s.certaintyFilter);
	const toggleCertainty = useAppStore((s) => s.toggleCertainty);
	if (certaintyFilter.includes(clash.certainty)) return null;
	return (
		<div className="flex items-start gap-2 rounded-md border border-dashed border-zinc-600 p-2 text-xs text-zinc-300">
			<EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
			<span className="flex-1">
				Its marker is hidden by the certainty filter (
				{humanizeEnum(clash.certainty)} is off).
			</span>
			<button
				type="button"
				className="underline underline-offset-2 hover:text-zinc-100"
				onClick={() => toggleCertainty(clash.certainty)}
			>
				Show
			</button>
		</div>
	);
}

function PanelBody({ detail }: { detail: ClashDetail }) {
	const { clash } = detail;
	return (
		<div className="flex flex-col gap-4">
			<HiddenNotice clash={clash} />
			<SeverityBlock clash={clash} />
			<ClearanceBlock detail={detail} />

			<section className="flex flex-col gap-2">
				<SectionTitle>Why this was flagged</SectionTitle>
				<p className="text-sm text-zinc-200">{clash.explanation}</p>
				<p className="text-xs text-zinc-400">
					2D baseline:{" "}
					{clash.baseline_flagged
						? "also flagged by the naive 2D overlay."
						: "not flagged by the naive 2D overlay."}
				</p>
			</section>

			<ReviewBlock key={clash.id} clash={clash} />

			{/* Evidence and the records behind it: one click each. Missing data
			    opens by itself when there is any, so it is never hidden. */}
			<div
				key={clash.id}
				className="-mt-1 flex flex-col border-b border-zinc-800"
			>
				<Disclosure title="Evidence" hint={`${clash.evidence.length}`}>
					<ul className="flex flex-col gap-2 text-xs">
						{clash.evidence.map((e) => (
							<li key={`${e.type}-${e.ref}`} className="text-zinc-400">
								<span className="font-mono">
									{humanizeEnum(e.type)} · {e.ref}
								</span>
								<br />
								{e.detail}
							</li>
						))}
					</ul>
				</Disclosure>
				<Disclosure title="Affected assets" hint={`${detail.assets.length}`}>
					{detail.assets.length === 0 ? (
						<p className="text-xs text-zinc-400">
							None — this is a work-to-work finding.
						</p>
					) : (
						<ul className="flex flex-col gap-2">
							{detail.assets.map((a) => (
								<AssetCard key={a.id} asset={a} />
							))}
						</ul>
					)}
				</Disclosure>
				<Disclosure title="Proposed works" hint={`${detail.works.length}`}>
					<ul className="flex flex-col gap-2">
						{detail.works.map((w) => (
							<WorkCard key={w.id} work={w} />
						))}
					</ul>
				</Disclosure>
				<Disclosure title="Severity factors">
					<FactorList clash={clash} />
				</Disclosure>
				{clash.missing_data.length > 0 && (
					<Disclosure
						title="Missing data"
						hint={`${clash.missing_data.length}`}
						defaultOpen
					>
						<ul className="flex flex-wrap gap-1.5 text-xs">
							{clash.missing_data.map((m) => (
								<li key={m}>
									<Value text={m} />
								</li>
							))}
						</ul>
					</Disclosure>
				)}
			</div>
		</div>
	);
}

/** Right-hand clash detail panel (SPEC §10.2) for the selected clash. */
export function ClashPanel({ clashId }: { clashId: string }) {
	const selectClash = useAppStore((s) => s.selectClash);
	const detail = useClash(clashId);
	const clash = detail.data?.clash;

	return (
		<div className="flex flex-col gap-4">
			<header className="flex items-start gap-2">
				<div className="flex flex-1 flex-col gap-2">
					<h2 className="font-mono text-sm font-semibold">{clashId}</h2>
					{clash && (
						<div className="flex flex-wrap gap-1.5">
							<span className="inline-flex items-center rounded-full border border-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-200">
								{humanizeEnum(clash.kind)}
							</span>
							<CertaintyBadge certainty={clash.certainty} />
							<StatusBadge status={clash.review.status} />
						</div>
					)}
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
					onClick={() => selectClash(null)}
					aria-label="Close clash details"
				>
					<X className="size-4" aria-hidden />
				</Button>
			</header>

			{detail.isPending ? (
				<SkeletonRows rows={6} label="Loading clash…" />
			) : detail.isError ? (
				<ErrorBlock
					title="Could not load this clash"
					error={detail.error}
					onRetry={() => detail.refetch()}
				/>
			) : (
				<PanelBody detail={detail.data} />
			)}
		</div>
	);
}
