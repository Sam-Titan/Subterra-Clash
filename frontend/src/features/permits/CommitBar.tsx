import { Loader2, MapPinPlus } from "lucide-react";
import { useId } from "react";
import type { CommitResponse, PermitDraft } from "@/api/types";
import { describeError } from "@/components/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/useAppStore";

/**
 * "Add to coordination plan" (never "approve"): the work joins the plan for
 * analysis. The server decides what is incomplete; its message is shown as sent.
 */
export function CommitBar({
	draft,
	committed,
	unsavedEdits,
	pending,
	error,
	onCommit,
	onOpenWorkspace,
	onStartOver,
}: {
	draft: PermitDraft;
	committed: CommitResponse | null;
	unsavedEdits: number;
	pending: boolean;
	error: unknown;
	onCommit: (reviewer: string) => void;
	onOpenWorkspace: () => void;
	onStartOver: () => void;
}) {
	const reviewerName = useAppStore((s) => s.reviewerName);
	const setReviewerName = useAppStore((s) => s.setReviewerName);
	const reviewerId = useId();
	const reviewer = reviewerName.trim();
	const failed = draft.geocode.status === "FAILED";
	const err = error ? describeError(error) : null;

	if (committed) {
		return (
			<section className="flex flex-col gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-sm">
				<p className="text-zinc-200">
					Added to the coordination plan as{" "}
					<span className="font-mono">{committed.work.id}</span> with{" "}
					{committed.new_clash_ids.length} new clash
					{committed.new_clash_ids.length === 1 ? "" : "es"} for review.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						onClick={onOpenWorkspace}
						className="bg-zinc-100 text-zinc-900 hover:bg-white"
					>
						Open in workspace
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={onStartOver}
						className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
					>
						Read another permit
					</Button>
				</div>
			</section>
		);
	}

	const blocker = !reviewer
		? "Enter a reviewer name."
		: unsavedEdits > 0
			? `Save or discard ${unsavedEdits} edit${unsavedEdits === 1 ? "" : "s"} first, so the plan gets what the preview shows.`
			: failed
				? "The path could not be placed yet (see the geocoder notes)."
				: null;

	return (
		<section className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3">
			<label
				htmlFor={reviewerId}
				className="flex flex-col gap-1 text-[11px] text-zinc-500"
			>
				Reviewer
				<Input
					id={reviewerId}
					value={reviewerName}
					onChange={(e) => setReviewerName(e.target.value)}
					className="h-8 border-zinc-700 bg-zinc-900 text-sm text-zinc-100"
				/>
			</label>
			<p className="text-xs text-zinc-500">
				Adds this work to the coordination plan so the engine checks it against
				existing utilities and works. It does not approve or reject the permit.
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					disabled={pending || blocker !== null}
					onClick={() => onCommit(reviewer)}
					className="bg-zinc-100 text-zinc-900 hover:bg-white"
				>
					{pending ? (
						<Loader2 className="size-4 animate-spin" aria-hidden />
					) : (
						<MapPinPlus className="size-4" aria-hidden />
					)}
					Add to coordination plan
				</Button>
				{blocker && <span className="text-xs text-zinc-400">{blocker}</span>}
			</div>
			{err && (
				<p role="alert" className="text-xs text-zinc-300">
					{err.detail}{" "}
					<code className="font-mono text-zinc-500">{err.code}</code>
				</p>
			)}
		</section>
	);
}
