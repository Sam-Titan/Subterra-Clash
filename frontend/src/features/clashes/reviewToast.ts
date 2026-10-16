import { toast } from "sonner";
import type { Clash, ReviewStatus } from "@/api/types";
import { describeError } from "@/components/QueryState";

const VERB: Record<ReviewStatus, string> = {
	OPEN: "reopened",
	ACKNOWLEDGED: "acknowledged",
	ESCALATED: "escalated",
	DISMISSED: "dismissed",
};

/** Confirms a recorded review decision with the clash id the server returned. */
export function toastReviewed(clash: Clash) {
	const { status, reviewer } = clash.review;
	toast.success(`${clash.id} ${VERB[status]}`, {
		description: reviewer
			? `Recorded by ${reviewer}. No permit has been approved or rejected.`
			: "No permit has been approved or rejected.",
	});
}

/** Extra signal on failure; the inline error with its code stays the source. */
export function toastFailed(title: string, error: unknown) {
	const { code, detail } = describeError(error);
	toast.error(title, { description: `${detail} (${code})` });
}
