import { type FormEvent, useId, useState } from "react";
import { useReviewClash } from "@/api/hooks";
import type { Clash } from "@/api/types";
import { describeError } from "@/components/QueryState";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { humanizeEnum } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";
import { toastReviewed } from "./reviewToast";

/**
 * Escalate one clash from the queue with an optional note. Only ESCALATE:
 * the other review actions stay in the workspace panel.
 */
export function EscalateDialog({
	clash,
	onClose,
	onEscalated,
}: {
	/** null = closed. */
	clash: Clash | null;
	onClose: () => void;
	onEscalated: (clash: Clash) => void;
}) {
	return (
		<Dialog open={clash !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
				{/* Keyed so the note and error reset for each clash. */}
				{clash && (
					<EscalateForm
						key={clash.id}
						clash={clash}
						onCancel={onClose}
						onEscalated={onEscalated}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function EscalateForm({
	clash,
	onCancel,
	onEscalated,
}: {
	clash: Clash;
	onCancel: () => void;
	onEscalated: (clash: Clash) => void;
}) {
	const reviewerName = useAppStore((s) => s.reviewerName);
	const setReviewerName = useAppStore((s) => s.setReviewerName);
	const [note, setNote] = useState("");
	const reviewerId = useId();
	const noteId = useId();
	const review = useReviewClash();
	const reviewer = reviewerName.trim();
	const error = review.isError ? describeError(review.error) : null;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!reviewer || review.isPending) return;
		review.mutate(
			{
				id: clash.id,
				body: {
					action: "ESCALATE",
					reviewer,
					note: note.trim() ? note.trim() : null,
				},
			},
			{
				onSuccess: (res) => {
					toastReviewed(res.clash);
					onEscalated(res.clash);
				},
			},
		);
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-4">
			<DialogHeader>
				<DialogTitle>Escalate {clash.id}</DialogTitle>
				<DialogDescription className="text-zinc-400">
					{humanizeEnum(clash.kind)} · {humanizeEnum(clash.certainty)}. This
					records an engineer's decision to escalate the finding. It does not
					approve or reject any permit.
				</DialogDescription>
			</DialogHeader>

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
			<label
				htmlFor={noteId}
				className="flex flex-col gap-1 text-[11px] text-zinc-500"
			>
				Note (optional)
				<Textarea
					id={noteId}
					value={note}
					onChange={(e) => setNote(e.target.value)}
					placeholder="e.g. Gas main — request standby during excavation"
					className="min-h-20 border-zinc-700 bg-zinc-900 text-sm text-zinc-100"
				/>
			</label>

			{!reviewer && (
				<p className="text-xs text-zinc-500">Enter a reviewer name.</p>
			)}
			{error && (
				<p role="alert" className="text-xs text-zinc-300">
					{error.detail}{" "}
					<code className="font-mono text-zinc-500">{error.code}</code>
				</p>
			)}

			<DialogFooter className="gap-2">
				<Button
					type="button"
					variant="ghost"
					className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
					onClick={onCancel}
				>
					Cancel
				</Button>
				<Button type="submit" disabled={!reviewer || review.isPending}>
					{review.isPending ? "Escalating…" : "Escalate"}
				</Button>
			</DialogFooter>
		</form>
	);
}
