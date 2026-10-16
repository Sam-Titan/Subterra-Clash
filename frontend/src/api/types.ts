// API types. Everything the backend exposes is an alias of the generated
// ./schema.d.ts (`pnpm gen:api` from shared/openapi.json); the local names stay
// stable so feature code never imports schema.d.ts directly.

import type { components } from "./schema";

type Schemas = components["schemas"];

export type Utility = Schemas["Utility"];
export type WorkType = Schemas["WorkType"];
export type ClashKind = Schemas["ClashKind"];
export type Certainty = Schemas["Certainty"];
export type SeverityBand = Schemas["Band"];
export type ReviewStatus = Schemas["ReviewStatus"];
export type CaptureMethod = Schemas["RecordMethod"];
export type Origin = Schemas["WorkOrigin"];

export const UTILITIES: readonly Utility[] = [
	"WATER",
	"SEWER",
	"POWER",
	"TELECOM",
	"GAS",
];
export const CERTAINTIES: readonly Certainty[] = [
	"LIKELY",
	"POSSIBLE",
	"NEEDS_DATA",
];

export const REVIEW_STATUSES: readonly ReviewStatus[] = [
	"OPEN",
	"ACKNOWLEDGED",
	"ESCALATED",
	"DISMISSED",
];

export type Point2 = [number, number];
export type Point3 = [number, number, number];

export type Bounds = Schemas["Bounds"];
export type Street = Schemas["Street"];
export type Junction = Schemas["Junction"];
export type Landmark = Schemas["Landmark"];
export type SourceRecord = Schemas["SourceRecord"];
export type Asset = Schemas["Asset"];
export type SourcePermit = Schemas["SourcePermit"];
export type Work = Schemas["Work"];
export type Scene = Schemas["Scene"];

export type SeverityFactors = Schemas["SeverityFactors"];
export type Severity = Schemas["Severity"];
export type Evidence = Schemas["Evidence"];
export type Review = Schemas["Review"];
export type Clash = Schemas["Clash"];
export type Rule = Schemas["Rule"];
/** `rule` is null for SCHEDULE_OVERLAP / DIG_ONCE clashes, and always in mock mode (no rules mock). */
export type ClashDetail = Schemas["ClashDetail"];
export type ClashGroup = Schemas["ClashGroup"];
export type ApiErrorBody = Schemas["ErrorResponse"];

export interface ListResponse<T> {
	items: T[];
	total: number;
}

// Same params as the generated `list_clashes_api_clashes_get` query, minus its
// `| null` (FastAPI's Optional), so they fit the URL builder in client.ts.
export interface ClashQuery {
	kind?: ClashKind;
	certainty?: Certainty;
	band?: SeverityBand;
	status?: ReviewStatus;
	utility?: Utility;
	work_id?: string;
	group_id?: string;
	sort?: "review_rank" | "severity" | "id";
}

/** `counts` cover unresolved clashes only (review status OPEN or ESCALATED). */
export type Summary = Schemas["Summary"];
export type EvaluationScore = Schemas["EvalScore"];
/**
 * `expected` / `ours`: a ClashKind or NO_CLASH; `baseline`: FLAGGED / NOT_FLAGGED.
 * The certainty fields are null when the outcome is NO_CLASH.
 */
export type EvaluationCase = Schemas["EvalCase"];

export type ReviewAction = Schemas["ReviewAction"];
/** `note` is required (non-empty) for DISMISS only. */
export type ReviewRequest = Schemas["ReviewRequest"];
/** `target_id` is null for entries with no target (RESET). */
export type AuditEntry = Schemas["AuditEntry"];
export type ReviewResponse = Schemas["ReviewResponse"];

// Permit intake (API_CONTRACT "Permit intake").
export type PermitDraft = Schemas["PermitDraft"];
export type ExtractedField = Schemas["ExtractedField"];
export type FieldValue = ExtractedField["value"];
export type GeocodeResult = Schemas["GeocodeResult"];
export type GeocodeStatus = GeocodeResult["status"];
export type SamplePermit = Schemas["SamplePermit"];
export type CommitRequest = Schemas["CommitRequest"];
export type CommitResponse = Schemas["CommitResponse"];
export type PatchDraftRequest = Schemas["PatchDraftRequest"];

/** The 15 extracted fields, in SPEC §9 order (the draft's `fields` keys). */
export const PERMIT_FIELDS = [
	"agency",
	"permit_no",
	"work_type",
	"utility",
	"street",
	"from_ref",
	"to_ref",
	"side",
	"offset_m",
	"depth_from_m",
	"depth_to_m",
	"width_m",
	"diameter_m",
	"start_date",
	"end_date",
] as const;
export type PermitFieldName = (typeof PERMIT_FIELDS)[number];

export const WORK_TYPES: readonly WorkType[] = [
	"TRENCH",
	"PIT",
	"HDD",
	"PIPE_LAY",
];
/** Values the backend accepts for `side` (PATCH → 422 INVALID_FIELD_VALUE otherwise). */
export const SIDES = ["NORTH", "SOUTH", "EAST", "WEST"] as const;
