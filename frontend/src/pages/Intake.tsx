import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
	type ParseInput,
	useClearIntakeSession,
	useCommitPermit,
	useIntakeSession,
	useParsePermit,
	usePatchPermit,
	useScene,
} from "@/api/hooks";
import type { PermitDraft, PermitFieldName } from "@/api/types";
import { LoadingBlock } from "@/components/QueryState";
import { CommitBar } from "@/features/permits/CommitBar";
import {
	changedFields,
	type Edits,
	FieldList,
} from "@/features/permits/FieldList";
import { InputPanel } from "@/features/permits/InputPanel";
import { PathPreview } from "@/features/permits/PathPreview";
import { fromInput } from "@/features/permits/permitFields";
import { SourceText } from "@/features/permits/SourceText";
import { useAppStore } from "@/store/useAppStore";

/** Permit intake (SPEC §9, §10.4): read → check and edit → place → add to plan. */
export default function Intake() {
	const navigate = useNavigate();
	const scene = useScene();
	const session = useIntakeSession();
	const clearSession = useClearIntakeSession();
	const parse = useParsePermit();
	const patch = usePatchPermit();
	const commit = useCommitPermit();
	const setIntakeResult = useAppStore((s) => s.setIntakeResult);
	const selectClash = useAppStore((s) => s.selectClash);

	const [edits, setEdits] = useState<Edits>({});
	const [active, setActive] = useState<PermitFieldName[]>([]);

	const draft = session?.draft ?? null;
	const committed = session?.committed ?? null;
	const changed = draft ? changedFields(draft, edits) : [];

	const startParse = (input: ParseInput) => {
		setEdits({});
		patch.reset();
		commit.reset();
		parse.mutate(input);
	};

	const save = (d: PermitDraft) => {
		const fields: Record<string, string | number | null> = {};
		for (const name of changed) {
			fields[name] = fromInput(name, edits[name] ?? "");
		}
		patch.mutate(
			{ draftId: d.draft_id, fields },
			{ onSuccess: () => setEdits({}) },
		);
	};

	const openWorkspace = (
		result: NonNullable<typeof committed>,
		d: PermitDraft,
	) => {
		setIntakeResult({
			workId: result.work.id,
			permitNo: result.work.source_permit.permit_no,
			clashIds: result.new_clash_ids,
			previewCount: d.preview_clash_count,
		});
		selectClash(null);
		navigate("/workspace");
	};

	return (
		<section className="flex flex-col gap-4 p-4 lg:p-6">
			<header className="flex flex-col gap-1">
				<h1 className="text-xl font-semibold">Permit intake</h1>
				<p className="text-sm text-zinc-400">
					Read a permit, check every value against the words it came from, then
					add the work to the coordination plan. The language model only reads
					text; the path is placed by a deterministic geocoder.
				</p>
			</header>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
				<div className="flex flex-col gap-5">
					<InputPanel
						onParse={startParse}
						pending={parse.isPending}
						error={parse.error}
					/>
					{draft && (
						<SourceText draft={draft} active={active} onHover={setActive} />
					)}
				</div>

				<div className="flex flex-col gap-5">
					{parse.isPending ? (
						<LoadingBlock label="Extracting fields…" />
					) : !draft ? (
						<div className="flex min-h-48 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-400">
							<p>No permit loaded.</p>
							<p className="text-xs">
								Pick a demo permit, paste text or drop a PDF to start.
							</p>
						</div>
					) : (
						<>
							<FieldList
								key={draft.draft_id}
								draft={draft}
								scene={scene.data}
								edits={edits}
								onEdit={(name, value) =>
									setEdits((e) => ({ ...e, [name]: value }))
								}
								active={active}
								onHover={setActive}
								onSave={() => save(draft)}
								onDiscard={() => setEdits({})}
								saving={patch.isPending}
								saveError={patch.error}
								locked={committed !== null}
							/>
							<PathPreview draft={draft} scene={scene} />
							<CommitBar
								draft={draft}
								committed={committed}
								unsavedEdits={changed.length}
								pending={commit.isPending}
								error={commit.error}
								onCommit={(reviewer) =>
									commit.mutate(
										{ draftId: draft.draft_id, reviewer },
										{
											onSuccess: (result) => {
												const n = result.new_clash_ids.length;
												toast.success(
													`${result.work.source_permit.permit_no} added to coordination plan`,
													{
														description: `${result.work.id} · ${n} new clash${n === 1 ? "" : "es"} found${n > 0 ? `: ${result.new_clash_ids.join(", ")}` : ""}.`,
													},
												);
												openWorkspace(result, draft);
											},
										},
									)
								}
								onOpenWorkspace={() =>
									committed && openWorkspace(committed, draft)
								}
								onStartOver={() => {
									clearSession();
									setEdits({});
									parse.reset();
									commit.reset();
								}}
							/>
						</>
					)}
				</div>
			</div>
		</section>
	);
}
