import {
	createColumnHelper,
	createSortedRowModel,
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_basic,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Siren } from "lucide-react";
import { type MouseEvent, type ReactNode, useMemo } from "react";
import {
	CERTAINTIES,
	type Clash,
	type ClashGroup,
	REVIEW_STATUSES,
	type Utility,
} from "@/api/types";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	INTAKE_COLORS,
	REVIEW_STATUS_COLORS,
	SEVERITY_BAND_COLORS,
	UTILITY_COLORS,
} from "@/lib/colors";
import { formatScore, humanizeEnum } from "@/lib/format";
import { CertaintyGlyph } from "./CertaintyGlyph";
import { compactClearance } from "./clearance";
import { type QueueSection, sectionRows } from "./queueRows";

const features = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns: { basic: sortFn_basic, alphanumeric: sortFn_alphanumeric },
});

export interface QueueRow {
	clash: Clash;
	/** The clash group's review_rank; undefined if the group is unknown. */
	rank: number | undefined;
}

const col = createColumnHelper<typeof features, QueueRow>();

/** Clicks on the row (outside its controls) open the clash too. */
function isFromControl(event: MouseEvent): boolean {
	return (
		event.target instanceof Element &&
		event.target.closest("button, a, input, textarea") !== null
	);
}

export function QueueTable({
	rows,
	groups,
	grouped,
	assetUtility,
	freshIds,
	groupTotals,
	onOpen,
	onEscalate,
}: {
	/** Filtered rows, already in review order (the unsorted order). */
	rows: QueueRow[];
	groups: readonly ClashGroup[];
	grouped: boolean;
	assetUtility: ReadonlyMap<string, Utility>;
	freshIds: ReadonlySet<string>;
	/** Clash count per group before filtering. */
	groupTotals: ReadonlyMap<string, number>;
	onOpen: (clash: Clash) => void;
	onEscalate: (clash: Clash) => void;
}) {
	const columns = useMemo(
		() =>
			col.columns([
				col.accessor((r) => r.rank, {
					id: "rank",
					header: "Rank",
					sortFn: "basic",
					sortUndefined: "last",
					cell: (info) => {
						const rank = info.getValue();
						return (
							<span className="font-mono text-xs tabular-nums text-zinc-400">
								{rank === undefined ? "—" : `#${rank}`}
							</span>
						);
					},
				}),
				col.accessor((r) => r.clash.id, {
					id: "clash",
					header: "Clash",
					sortFn: "alphanumeric",
					cell: (info) => {
						const clash = info.row.original.clash;
						return (
							<span className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => onOpen(clash)}
									className="rounded font-mono text-xs text-zinc-100 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
									title="Open in workspace"
								>
									{clash.id}
								</button>
								{freshIds.has(clash.id) && (
									<span
										className="rounded-full border px-1.5 text-[10px] leading-4"
										style={{
											borderColor: INTAKE_COLORS.newClashRing,
											color: INTAKE_COLORS.newClashRing,
										}}
									>
										New
									</span>
								)}
							</span>
						);
					},
				}),
				col.accessor((r) => r.clash.severity.score, {
					id: "severity",
					header: "Severity",
					sortFn: "basic",
					sortDescFirst: true,
					cell: (info) => {
						const { band, score } = info.row.original.clash.severity;
						return (
							<span
								className="font-mono text-xs font-semibold tabular-nums"
								style={{ color: SEVERITY_BAND_COLORS[band] }}
								title={`Severity ${humanizeEnum(band)}`}
							>
								{formatScore(score)}{" "}
								<span className="font-sans font-normal text-zinc-500">
									{humanizeEnum(band)}
								</span>
							</span>
						);
					},
				}),
				col.accessor((r) => r.clash.kind, {
					id: "kind",
					header: "Kind",
					sortFn: "alphanumeric",
					cell: (info) => (
						<span className="text-xs">{humanizeEnum(info.getValue())}</span>
					),
				}),
				// Sorted LIKELY → POSSIBLE → NEEDS_DATA, not alphabetically.
				col.accessor((r) => CERTAINTIES.indexOf(r.clash.certainty), {
					id: "certainty",
					header: "Certainty",
					sortFn: "basic",
					cell: (info) => {
						const certainty = info.row.original.clash.certainty;
						return (
							<span className="flex items-center gap-1.5 text-xs">
								<CertaintyGlyph certainty={certainty} />
								{humanizeEnum(certainty)}
							</span>
						);
					},
				}),
				col.accessor((r) => r.clash.asset_ids.join(", "), {
					id: "assets",
					header: "Assets",
					sortFn: "alphanumeric",
					cell: (info) => {
						const ids = info.row.original.clash.asset_ids;
						if (ids.length === 0) {
							return <span className="text-xs text-zinc-500">—</span>;
						}
						return (
							<span className="flex flex-wrap gap-x-2 gap-y-0.5">
								{ids.map((id) => {
									const utility = assetUtility.get(id);
									return (
										<span
											key={id}
											className="flex items-center gap-1 font-mono text-xs"
										>
											{utility && (
												<span
													aria-hidden
													className="size-2 rounded-full"
													style={{ backgroundColor: UTILITY_COLORS[utility] }}
												/>
											)}
											{id}
										</span>
									);
								})}
							</span>
						);
					},
				}),
				col.accessor((r) => r.clash.work_ids.join(", "), {
					id: "work",
					header: "Work",
					sortFn: "alphanumeric",
					cell: (info) => (
						<span className="font-mono text-xs">{info.getValue()}</span>
					),
				}),
				// No measured gap (NEEDS_DATA, schedule) → undefined → always last.
				col.accessor((r) => r.clash.measured_gap_m ?? undefined, {
					id: "gap",
					header: "Gap / required",
					sortFn: "basic",
					sortUndefined: "last",
					cell: (info) => {
						const clash = info.row.original.clash;
						return (
							<span className="flex flex-col">
								<span className="font-mono text-xs tabular-nums">
									{compactClearance(clash)}
								</span>
								{clash.missing_data.length > 0 && (
									<span className="text-[11px] text-zinc-500">
										Missing: {clash.missing_data.join(", ")}
									</span>
								)}
							</span>
						);
					},
				}),
				col.accessor((r) => REVIEW_STATUSES.indexOf(r.clash.review.status), {
					id: "status",
					header: "Status",
					sortFn: "basic",
					cell: (info) => {
						const { status, reviewer } = info.row.original.clash.review;
						return (
							<span className="flex flex-col">
								<span className="flex items-center gap-1.5 text-xs">
									<span
										aria-hidden
										className="size-1.5 rounded-full"
										style={{ backgroundColor: REVIEW_STATUS_COLORS[status] }}
									/>
									{humanizeEnum(status)}
								</span>
								{reviewer && status !== "OPEN" && (
									<span className="text-[11px] text-zinc-500">
										by {reviewer}
									</span>
								)}
							</span>
						);
					},
				}),
				col.display({
					id: "actions",
					header: () => <span className="sr-only">Actions</span>,
					cell: (info) => {
						const clash = info.row.original.clash;
						const escalated = clash.review.status === "ESCALATED";
						return (
							<Button
								size="sm"
								variant="ghost"
								className="h-7 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
								disabled={escalated}
								onClick={() => onEscalate(clash)}
								aria-label={`Escalate ${clash.id}`}
							>
								<Siren className="size-3.5" aria-hidden />
								{escalated ? "Escalated" : "Escalate…"}
							</Button>
						);
					},
				}),
			]),
		[assetUtility, freshIds, onOpen, onEscalate],
	);

	const table = useTable({
		features,
		columns,
		data: rows,
		getRowId: (row) => row.clash.id,
		initialState: { sorting: [{ id: "rank", desc: false }] },
	});

	const sortedRows = table.getRowModel().rows;
	const sections = useMemo<QueueSection<(typeof sortedRows)[number]>[]>(
		() =>
			grouped
				? sectionRows(sortedRows, (row) => row.original.clash, groups)
				: [{ key: "all", group: null, rows: sortedRows }],
		[grouped, sortedRows, groups],
	);
	const columnCount = columns.length;

	return (
		<Table className="text-zinc-200">
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => (
					<TableRow key={headerGroup.id} className="border-zinc-800">
						{headerGroup.headers.map((header) => {
							const column = header.column;
							const sorted = column.getIsSorted();
							const canSort = column.getCanSort();
							return (
								<TableHead
									key={header.id}
									aria-sort={
										!canSort
											? undefined
											: sorted === "asc"
												? "ascending"
												: sorted === "desc"
													? "descending"
													: "none"
									}
									className="h-9 whitespace-nowrap text-xs text-zinc-400"
								>
									{canSort ? (
										<button
											type="button"
											onClick={column.getToggleSortingHandler()}
											className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
										>
											<table.FlexRender header={header} />
											{sorted === "asc" ? (
												<ArrowUp className="size-3" aria-hidden />
											) : sorted === "desc" ? (
												<ArrowDown className="size-3" aria-hidden />
											) : (
												<ArrowUpDown
													className="size-3 text-zinc-600"
													aria-hidden
												/>
											)}
										</button>
									) : (
										<table.FlexRender header={header} />
									)}
								</TableHead>
							);
						})}
					</TableRow>
				))}
			</TableHeader>
			<TableBody>
				{sections.map((section) => (
					<SectionRows
						key={section.key}
						section={section}
						grouped={grouped}
						columnCount={columnCount}
						groupTotal={groupTotals.get(section.key)}
					>
						{section.rows.map((row) => (
							<TableRow
								key={row.id}
								onClick={(e) => {
									if (!isFromControl(e)) onOpen(row.original.clash);
								}}
								className="cursor-pointer border-zinc-800/70 hover:bg-zinc-900"
							>
								{row.getAllCells().map((cell) => (
									<TableCell key={cell.id} className="py-2 align-top">
										<table.FlexRender cell={cell} />
									</TableCell>
								))}
							</TableRow>
						))}
					</SectionRows>
				))}
			</TableBody>
		</Table>
	);
}

function SectionRows({
	section,
	grouped,
	columnCount,
	groupTotal,
	children,
}: {
	section: QueueSection<unknown>;
	grouped: boolean;
	columnCount: number;
	groupTotal: number | undefined;
	children: ReactNode;
}) {
	if (!grouped) return children;
	const { group } = section;
	const shown = section.rows.length;
	return (
		<>
			<TableRow className="border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/60">
				<TableCell colSpan={columnCount} className="py-1.5">
					<span className="flex flex-wrap items-baseline gap-x-3 text-xs">
						{group && (
							<span className="font-mono text-zinc-400">
								#{group.review_rank}
							</span>
						)}
						<span className="font-semibold text-zinc-100">
							{group?.title ?? section.key}
						</span>
						<span className="text-zinc-500">
							{groupTotal !== undefined && groupTotal !== shown
								? `${shown} of ${groupTotal} shown`
								: `${shown} ${shown === 1 ? "clash" : "clashes"}`}
						</span>
						{group && (
							<span className="text-zinc-500">
								max severity{" "}
								<span className="font-mono tabular-nums text-zinc-300">
									{formatScore(group.max_severity_score)}
								</span>
							</span>
						)}
					</span>
				</TableCell>
			</TableRow>
			{children}
		</>
	);
}
