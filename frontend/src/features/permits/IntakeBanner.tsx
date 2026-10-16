import { X } from "lucide-react";
import type { Clash } from "@/api/types";
import { Button } from "@/components/ui/button";
import { CertaintyGlyph } from "@/features/clashes/CertaintyGlyph";
import { INTAKE_COLORS } from "@/lib/colors";
import { useAppStore } from "@/store/useAppStore";

/**
 * Shown in the workspace after "Add to coordination plan": the new work and its
 * clashes (click one to fly to it). Stays until dismissed.
 */
export function IntakeBanner({ clashes }: { clashes: Clash[] }) {
	const result = useAppStore((s) => s.intakeResult);
	const setIntakeResult = useAppStore((s) => s.setIntakeResult);
	const selectClash = useAppStore((s) => s.selectClash);
	if (!result) return null;

	const byId = new Map(clashes.map((c) => [c.id, c]));
	const count = result.clashIds.length;
	const differs = count !== result.previewCount;

	return (
		<div
			role="status"
			className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-lg border bg-zinc-950/95 p-3 text-sm shadow-lg"
			style={{ borderColor: INTAKE_COLORS.newClashRing }}
		>
			<div className="flex items-start gap-2">
				<p className="flex-1 text-zinc-200">
					<span className="font-mono">{result.workId}</span> (permit{" "}
					<span className="font-mono">{result.permitNo}</span>) added to the
					coordination plan —{" "}
					{count === 0
						? "no new clashes found."
						: `${count} new clash${count === 1 ? "" : "es"} for review.`}
				</p>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
					onClick={() => setIntakeResult(null)}
					aria-label="Dismiss"
				>
					<X className="size-3.5" aria-hidden />
				</Button>
			</div>
			{differs && (
				<p className="text-xs" style={{ color: INTAKE_COLORS.warning }}>
					The intake preview estimated {result.previewCount}; the engine found{" "}
					{count} after adding the work.
				</p>
			)}
			{count > 0 && (
				<ul className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
					{result.clashIds.map((id) => {
						const clash = byId.get(id);
						return (
							<li key={id}>
								<button
									type="button"
									onClick={() => selectClash(id)}
									className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-2 py-0.5 font-mono text-xs text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
								>
									{clash && <CertaintyGlyph certainty={clash.certainty} />}
									{id}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
