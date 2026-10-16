import { useMemo } from "react";
import {
	PERMIT_FIELDS,
	type PermitDraft,
	type PermitFieldName,
} from "@/api/types";
import { INTAKE_COLORS } from "@/lib/colors";
import { FIELD_META, findQuoteSpans, segmentText } from "./permitFields";

const MODE_TEXT: Record<PermitDraft["llm_mode_used"], string> = {
	live: "Read by the LLM just now.",
	cached: "Cached LLM reading of a demo permit (offline).",
	rules:
		"Offline rule-based reading (no LLM response for this text). Confidence is lower; check every field.",
};

/**
 * The permit as received. Every field's quote is underlined at its first
 * occurrence; the quotes of the hovered field(s) are highlighted. Overlapping
 * or shared quotes are split into flat segments, so layout never shifts.
 */
export function SourceText({
	draft,
	active,
	onHover,
}: {
	draft: PermitDraft;
	active: readonly PermitFieldName[];
	onHover: (fields: PermitFieldName[]) => void;
}) {
	const { segments, notFound } = useMemo(() => {
		const { spans, notFound } = findQuoteSpans(
			draft.source_text,
			draft,
			PERMIT_FIELDS,
		);
		return { segments: segmentText(draft.source_text, spans), notFound };
	}, [draft]);

	return (
		<section className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between gap-2">
				<h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
					Source text
				</h2>
				<span className="font-mono text-[11px] text-zinc-500">
					{draft.draft_id} · {draft.llm_mode_used}
				</span>
			</div>
			<p className="text-xs text-zinc-500">{MODE_TEXT[draft.llm_mode_used]}</p>
			<p className="whitespace-pre-wrap break-words rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-sm leading-relaxed text-zinc-200">
				{segments.map((seg) => {
					if (seg.fields.length === 0) {
						return <span key={seg.start}>{seg.text}</span>;
					}
					const lit = seg.fields.some((f) => active.includes(f));
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: hover only mirrors the field list, which is keyboard-reachable
						<span
							key={seg.start}
							title={seg.fields.map((f) => FIELD_META[f].label).join(", ")}
							onMouseEnter={() => onHover(seg.fields)}
							onMouseLeave={() => onHover([])}
							className="rounded-sm underline decoration-2 underline-offset-4 transition-colors [box-decoration-break:clone]"
							style={{
								textDecorationColor: INTAKE_COLORS.quoteUnderline,
								backgroundColor: lit ? INTAKE_COLORS.quoteActive : undefined,
							}}
						>
							{seg.text}
						</span>
					);
				})}
			</p>
			{notFound.length > 0 && (
				<p className="text-xs text-zinc-400">
					Quote not found verbatim in the text for:{" "}
					{notFound.map((f) => FIELD_META[f].label).join(", ")}.
				</p>
			)}
		</section>
	);
}
