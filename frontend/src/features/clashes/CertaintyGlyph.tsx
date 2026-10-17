import type { Certainty } from "@/api/types";
import { CERTAINTIES } from "@/api/types";
import { CERTAINTY_COLORS, CERTAINTY_STYLE } from "@/lib/colors";
import { humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 2D twin of the 3D marker: solid dot, dashed ring, or grey "?" (SPEC §10). */
export function CertaintyGlyph({
	certainty,
	className,
}: {
	certainty: Certainty;
	className?: string;
}) {
	const color = CERTAINTY_COLORS[certainty];
	const style = CERTAINTY_STYLE[certainty];
	return (
		<span
			role="img"
			aria-label={humanizeEnum(certainty)}
			className={cn(
				"inline-flex size-3 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none text-zinc-950",
				style === "dashed-ring" && "border border-dashed",
				className,
			)}
			style={
				style === "dashed-ring"
					? { borderColor: color }
					: { backgroundColor: color }
			}
		>
			{style === "question" ? "?" : null}
		</span>
	);
}

export function CertaintyBadge({ certainty }: { certainty: Certainty }) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-200">
			<CertaintyGlyph certainty={certainty} />
			{humanizeEnum(certainty)}
		</span>
	);
}

/**
 * The three certainty classes, always on screen (domain rule 3), so a marker
 * or glyph never needs a click to be decoded.
 */
export function CertaintyLegend({ className }: { className?: string }) {
	return (
		<ul
			aria-label="Certainty legend"
			className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}
		>
			{CERTAINTIES.map((c) => (
				<li key={c} className="flex items-center gap-1.5 text-xs text-zinc-300">
					<span aria-hidden>
						<CertaintyGlyph certainty={c} />
					</span>
					{humanizeEnum(c)}
				</li>
			))}
		</ul>
	);
}
