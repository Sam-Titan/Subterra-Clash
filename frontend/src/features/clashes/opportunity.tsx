import { CalendarCheck } from "lucide-react";
import type { Clash } from "@/api/types";
import { SEVERITY_BAND_COLORS } from "@/lib/colors";

/**
 * Groups whose clashes are all DIG_ONCE: a chance to coordinate works, not a
 * conflict. Taken from the clash data, never parsed from the group title.
 */
export function opportunityGroupIds(clashes: readonly Clash[]): Set<string> {
	const conflictGroups = new Set<string>();
	const seen = new Set<string>();
	for (const c of clashes) {
		seen.add(c.group_id);
		if (c.kind !== "DIG_ONCE") conflictGroups.add(c.group_id);
	}
	return new Set([...seen].filter((id) => !conflictGroups.has(id)));
}

export function OpportunityChip() {
	const color = SEVERITY_BAND_COLORS.INFO;
	return (
		<span
			className="inline-flex items-center gap-1 rounded-full border px-1.5 text-xs font-normal normal-case leading-4 tracking-normal"
			style={{ borderColor: color, color }}
		>
			<CalendarCheck className="size-3" aria-hidden />
			Dig-once opportunity · coordinate works
		</span>
	);
}
