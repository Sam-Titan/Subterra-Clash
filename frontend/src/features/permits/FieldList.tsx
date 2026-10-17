import { AlertTriangle, Loader2, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import {
	type PermitDraft,
	type PermitFieldName,
	type Scene,
	SIDES,
	UTILITIES,
	WORK_TYPES,
} from "@/api/types";
import { describeError } from "@/components/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { CONFIDENCE_COLORS, INTAKE_COLORS } from "@/lib/colors";
import { humanizeEnum, MISSING, utilityLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	type ConfidenceTier,
	confidenceTier,
	type DraftInput,
	FIELD_GROUPS,
	FIELD_META,
	fieldOf,
	fromInput,
	isAssumed,
	notesFor,
	toInput,
} from "./permitFields";

/** Seconds between fields appearing after a parse. */
const STAGGER_S = 0.06;

export type Edits = Partial<Record<PermitFieldName, DraftInput>>;

interface Option {
	value: string;
	label: string;
}

function optionsFor(
	name: PermitFieldName,
	scene: Scene | undefined,
): { group?: string; items: Option[] }[] {
	switch (name) {
		case "work_type":
			return [
				{
					items: WORK_TYPES.map((v) => ({ value: v, label: humanizeEnum(v) })),
				},
			];
		case "utility":
			return [
				{ items: UTILITIES.map((v) => ({ value: v, label: utilityLabel(v) })) },
			];
		case "side":
			return [
				{ items: SIDES.map((v) => ({ value: v, label: humanizeEnum(v) })) },
			];
		case "street":
			return [
				{
					items: (scene?.streets ?? []).map((s) => ({
						value: s.id,
						label: s.name,
					})),
				},
			];
		case "from_ref":
		case "to_ref":
			return [
				{
					group: "Junctions",
					items: (scene?.junctions ?? []).map((j) => ({
						value: j.id,
						label: j.name,
					})),
				},
				{
					group: "Landmarks",
					items: (scene?.landmarks ?? []).map((l) => ({
						value: l.id,
						label: l.name,
					})),
				},
			];
		default:
			return [];
	}
}

const TIER_LABEL: Record<ConfidenceTier, string> = {
	high: "High",
	medium: "Medium",
	low: "Low",
	missing: "Missing",
	edited: "Edited",
};

function ConfidenceChip({
	tier,
	confidence,
}: {
	tier: ConfidenceTier;
	confidence: number;
}) {
	const color = tier === "missing" ? undefined : CONFIDENCE_COLORS[tier];
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px font-mono text-xs tabular-nums",
				tier === "missing"
					? "border-dashed border-zinc-600 italic text-zinc-400"
					: "border-zinc-700 text-zinc-300",
			)}
			title={`Extraction confidence ${confidence.toFixed(2)}`}
		>
			{color && (
				<span
					aria-hidden
					className="size-1.5 rounded-full"
					style={{ backgroundColor: color }}
				/>
			)}
			{TIER_LABEL[tier]}
			{tier !== "missing" && tier !== "edited" && ` ${confidence.toFixed(2)}`}
		</span>
	);
}

/** Engine rules for missing values (API_CONTRACT "Missing data"). */
function missingNote(name: PermitFieldName): string | null {
	if (name === "depth_from_m" || name === "depth_to_m")
		return "Not stated: the engine assesses the plausible 0.5–3.0 m band and its clashes become Needs data.";
	if (name === "width_m")
		return "Not stated: a default trench width is assumed and stays listed as missing.";
	return null;
}

function FieldRow({
	name,
	draft,
	scene,
	input,
	dirty,
	lit,
	disabled,
	onChange,
	onHover,
}: {
	name: PermitFieldName;
	draft: PermitDraft;
	scene: Scene | undefined;
	input: DraftInput;
	dirty: boolean;
	lit: boolean;
	disabled: boolean;
	onChange: (value: DraftInput) => void;
	onHover: (fields: PermitFieldName[]) => void;
}) {
	const meta = FIELD_META[name];
	const field = fieldOf(draft, name);
	const tier = confidenceTier(field);
	const assumed = isAssumed(name, field);
	const notes = notesFor(draft, name);
	const missingText = field.value === null ? missingNote(name) : null;
	const inputId = useId();
	const label = meta.unit ? `${meta.label} (${meta.unit})` : meta.label;
	const editor = (
		<FieldEditor
			id={inputId}
			name={name}
			scene={scene}
			input={input}
			disabled={disabled}
			onChange={onChange}
		/>
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover/focus only highlights the quote; the inputs inside are the interactive parts
		<div
			onMouseEnter={() => onHover([name])}
			onMouseLeave={() => onHover([])}
			onFocus={() => onHover([name])}
			onBlur={() => onHover([])}
			className={cn(
				"flex flex-col gap-1 rounded-md border px-2 py-1.5 transition-colors",
				lit ? "border-zinc-500 bg-zinc-900" : "border-transparent",
			)}
		>
			<div className="flex items-center gap-2">
				<label
					htmlFor={inputId}
					className="min-w-0 flex-1 truncate text-xs text-zinc-400"
				>
					{label}
					{dirty && <span className="ml-1 text-zinc-200">• edited</span>}
				</label>
				{assumed && (
					<span
						className="inline-flex shrink-0 items-center rounded-full border border-dashed px-1.5 py-px text-xs"
						style={{
							borderColor: INTAKE_COLORS.warning,
							color: INTAKE_COLORS.warning,
						}}
						title="This value is not stated literally in its quote."
					>
						Assumed
					</span>
				)}
				<ConfidenceChip tier={tier} confidence={field.confidence} />
			</div>
			<div className="flex items-center gap-1">
				<div className="min-w-0 flex-1">{editor}</div>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
					disabled={disabled || input === ""}
					onClick={() => onChange("")}
					aria-label={`Clear ${meta.label}`}
					title="Clear (mark as missing)"
				>
					<X className="size-3.5" aria-hidden />
				</Button>
			</div>
			{field.source_quote && (
				<p
					className="truncate text-xs text-zinc-400"
					title={field.source_quote}
				>
					Quote: <span className="text-zinc-300">“{field.source_quote}”</span>
				</p>
			)}
			{assumed && (
				<p className="text-xs" style={{ color: INTAKE_COLORS.warning }}>
					Value {String(field.value)} is not written in the quote; it was
					inferred. Check it.
				</p>
			)}
			{missingText && <p className="text-xs text-zinc-400">{missingText}</p>}
			{notes.map((n) => (
				<p
					key={n}
					className="flex items-start gap-1 text-xs"
					style={{ color: INTAKE_COLORS.warning }}
				>
					<AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
					{n}
				</p>
			))}
		</div>
	);
}

function FieldEditor({
	id,
	name,
	scene,
	input,
	disabled,
	onChange,
}: {
	id: string;
	name: PermitFieldName;
	scene: Scene | undefined;
	input: DraftInput;
	disabled: boolean;
	onChange: (value: DraftInput) => void;
}) {
	const { kind } = FIELD_META[name];

	if (kind === "enum" || kind === "street" || kind === "ref") {
		const groups = optionsFor(name, scene);
		const known = groups.some((g) => g.items.some((o) => o.value === input));
		return (
			<Select value={input} onValueChange={onChange} disabled={disabled}>
				<SelectTrigger
					id={id}
					className={cn(
						"h-8 border-zinc-700 bg-zinc-900 text-sm text-zinc-100",
						input === "" && "border-dashed italic text-zinc-400",
					)}
				>
					<SelectValue placeholder={`${MISSING} — pick…`} />
				</SelectTrigger>
				<SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-100">
					{/* A value the scene does not list (scene still loading) stays selectable. */}
					{!known && input !== "" && (
						<SelectItem value={input}>{input}</SelectItem>
					)}
					{groups.map((g) => (
						<SelectGroup key={g.group ?? "all"}>
							{g.group && (
								<SelectLabel className="text-xs text-zinc-400">
									{g.group}
								</SelectLabel>
							)}
							{g.items.map((o) => (
								<SelectItem key={o.value} value={o.value}>
									{o.label}
									{(kind === "street" || kind === "ref") && (
										<span className="ml-2 font-mono text-xs text-zinc-400">
											{o.value}
										</span>
									)}
								</SelectItem>
							))}
						</SelectGroup>
					))}
				</SelectContent>
			</Select>
		);
	}

	return (
		<Input
			id={id}
			type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
			step={kind === "number" ? "0.01" : undefined}
			min={kind === "number" ? "0" : undefined}
			value={input}
			placeholder={MISSING}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
			className={cn(
				"h-8 border-zinc-700 bg-zinc-900 text-sm text-zinc-100 [color-scheme:dark]",
				input === "" && "border-dashed placeholder:italic",
			)}
		/>
	);
}

/**
 * The 15 extracted fields, grouped, each editable. Edits are held locally and
 * sent as one PATCH; the server's re-geocoded draft replaces the view.
 */
export function FieldList({
	draft,
	scene,
	edits,
	onEdit,
	active,
	onHover,
	onSave,
	onDiscard,
	saving,
	saveError,
	locked,
}: {
	draft: PermitDraft;
	scene: Scene | undefined;
	edits: Edits;
	onEdit: (name: PermitFieldName, value: DraftInput) => void;
	active: readonly PermitFieldName[];
	onHover: (fields: PermitFieldName[]) => void;
	onSave: () => void;
	onDiscard: () => void;
	saving: boolean;
	saveError: unknown;
	/** Already added to the plan: no more edits. */
	locked: boolean;
}) {
	const reduceMotion = useReducedMotion();
	const changed = changedFields(draft, edits);
	const error = saveError ? describeError(saveError) : null;
	let index = 0;

	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-baseline justify-between">
				<h2 className="text-xs font-medium text-zinc-400">Extracted fields</h2>
				<span className="text-xs text-zinc-400">
					hover a field to see its source words
				</span>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-xs text-zinc-400">
					Missing in the permit ({draft.missing_fields.length}):
				</span>
				{draft.missing_fields.length === 0 ? (
					<span className="text-xs text-zinc-400">None.</span>
				) : (
					<ul className="flex flex-wrap gap-1.5">
						{draft.missing_fields.map((m) => (
							<li
								key={m}
								className="rounded border border-dashed border-zinc-600 px-1 font-mono text-xs italic text-zinc-400"
							>
								{m}
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="grid gap-x-3 gap-y-3 md:grid-cols-2">
				{FIELD_GROUPS.map((group) => (
					<div key={group.title} className="flex flex-col gap-0.5">
						<h3 className="px-2 text-xs font-medium text-zinc-400">
							{group.title}
						</h3>
						{group.fields.map((name) => {
							const i = index++;
							const input = edits[name] ?? toInput(fieldOf(draft, name).value);
							return (
								<motion.div
									key={name}
									initial={reduceMotion ? false : { opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: i * STAGGER_S, duration: 0.25 }}
								>
									<FieldRow
										name={name}
										draft={draft}
										scene={scene}
										input={input}
										dirty={changed.includes(name)}
										lit={active.includes(name)}
										disabled={saving || locked}
										onChange={(v) => onEdit(name, v)}
										onHover={onHover}
									/>
								</motion.div>
							);
						})}
					</div>
				))}
			</div>

			{!locked && (
				<div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
					<Button
						size="sm"
						disabled={changed.length === 0 || saving}
						onClick={onSave}
						className="bg-zinc-100 text-zinc-900 hover:bg-white"
					>
						{saving && (
							<Loader2 className="size-3.5 animate-spin" aria-hidden />
						)}
						Save edits{changed.length > 0 && ` (${changed.length})`}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={changed.length === 0 || saving}
						onClick={onDiscard}
						className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
					>
						Discard
					</Button>
					<span className="text-xs text-zinc-400">
						Saving re-places the path and re-counts the preview.
					</span>
				</div>
			)}
			{error && (
				<p role="alert" className="text-xs text-zinc-300">
					{error.detail}{" "}
					<code className="font-mono text-zinc-400">{error.code}</code>
				</p>
			)}
		</section>
	);
}

/** Fields whose edited input differs from the draft's value. */
export function changedFields(
	draft: PermitDraft,
	edits: Edits,
): PermitFieldName[] {
	return (Object.keys(edits) as PermitFieldName[]).filter((name) => {
		const input = edits[name];
		return (
			input !== undefined &&
			fromInput(name, input) !== fieldOf(draft, name).value
		);
	});
}
