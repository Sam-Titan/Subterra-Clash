// Pure helpers for the review queue: group sections and the client CSV.

import type { Clash, ClashGroup } from "@/api/types";

export interface QueueSection<T> {
	key: string;
	group: ClashGroup | null;
	rows: T[];
}

/**
 * Split already-sorted rows into clash-group sections in review order.
 * Row order inside a section is kept, so the table's sort applies per group.
 * Rows whose group is not (yet) in /groups come last, one section per id.
 */
export function sectionRows<T>(
	rows: readonly T[],
	clashOf: (row: T) => Clash,
	groups: readonly ClashGroup[],
): QueueSection<T>[] {
	const byGroup = new Map<string, T[]>();
	for (const row of rows) {
		const id = clashOf(row).group_id;
		const list = byGroup.get(id) ?? [];
		list.push(row);
		byGroup.set(id, list);
	}
	const sections: QueueSection<T>[] = [];
	const ordered = [...groups].sort((a, b) => a.review_rank - b.review_rank);
	for (const group of ordered) {
		const list = byGroup.get(group.id);
		if (!list) continue;
		sections.push({ key: group.id, group, rows: list });
		byGroup.delete(group.id);
	}
	for (const [id, list] of byGroup) {
		sections.push({ key: id, group: null, rows: list });
	}
	return sections;
}

/** Spreadsheet apps run cells starting with these as formulas. */
const FORMULA_START = /^[=+\-@]/;

export function csvCell(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "";
	// Numbers are safe as-is; prefixing would turn −0.6 into text.
	if (typeof value === "number") return String(value);
	const text = FORMULA_START.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const CSV_HEADER = [
	"clash_id",
	"review_rank",
	"group_id",
	"group_title",
	"severity_score",
	"severity_band",
	"kind",
	"certainty",
	"asset_ids",
	"work_ids",
	"measured_gap_m",
	"required_clearance_m",
	"uncertainty_m",
	"overlap_days",
	"gap_days",
	"missing_data",
	"location_x",
	"location_y",
	"location_z",
	"rule_id",
	"review_status",
	"reviewer",
	"review_note",
	"explanation",
];

/**
 * Flat CSV of the given clashes (UTF-8 BOM, CRLF). Missing numbers are left
 * empty, never written as 0; `missing_data` names what is missing.
 */
export function clashesToCsv(
	clashes: readonly Clash[],
	groups: readonly ClashGroup[],
): string {
	const groupById = new Map(groups.map((g) => [g.id, g]));
	const lines = [CSV_HEADER.join(",")];
	for (const c of clashes) {
		const group = groupById.get(c.group_id);
		const row: (string | number | null | undefined)[] = [
			c.id,
			group?.review_rank,
			c.group_id,
			group?.title,
			Math.round(c.severity.score),
			c.severity.band,
			c.kind,
			c.certainty,
			c.asset_ids.join("; "),
			c.work_ids.join("; "),
			c.measured_gap_m,
			c.required_clearance_m,
			c.uncertainty_m,
			c.schedule?.overlap_days,
			c.schedule?.gap_days,
			c.missing_data.join("; "),
			c.location.x,
			c.location.y,
			c.location.z,
			c.rule_id,
			c.review.status,
			c.review.reviewer,
			c.review.note,
			c.explanation,
		];
		lines.push(row.map(csvCell).join(","));
	}
	return `﻿${lines.join("\r\n")}\r\n`;
}
