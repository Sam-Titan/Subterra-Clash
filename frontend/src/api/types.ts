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

// Summary is hand-written (SPEC §7 / API_CONTRACT) because GET /api/summary is
// not in shared/openapi.json yet. Switch these to generated aliases after
// backend 3A exports it.
export interface EvaluationScore {
	true_positives: number;
	false_alarms: number;
	misses: number;
	precision: number;
	recall: number;
}

export interface EvaluationCase {
	case_id: string;
	description: string;
	expected: string;
	ours: string;
	baseline: string;
}

export interface Summary {
	counts: {
		open: number;
		critical: number;
		high: number;
		needs_data: number;
		dig_once: number;
		schedule_overlap: number;
	};
	by_utility: { utility: Utility; count: number }[];
	by_certainty: { certainty: Certainty; count: number }[];
	evaluation: {
		ours: EvaluationScore;
		baseline: EvaluationScore;
		cases: EvaluationCase[];
	};
}

// Review types are hand-written from docs/API_CONTRACT.md because
// POST /api/clashes/{id}/review (backend 2C) is not in shared/openapi.json yet.
// Switch these to generated aliases after 2C exports it.
export type ReviewAction = "ACKNOWLEDGE" | "ESCALATE" | "DISMISS" | "REOPEN";

export interface ReviewRequest {
	action: ReviewAction;
	reviewer: string;
	/** Required (non-empty) for DISMISS only. */
	note: string | null;
}

export interface AuditEntry {
	id: string;
	at: string;
	actor: string;
	action: string;
	target_id: string;
	detail: string;
}

export interface ReviewResponse {
	clash: Clash;
	audit: AuditEntry;
}
