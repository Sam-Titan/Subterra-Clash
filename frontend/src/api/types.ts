// Hand-written mirrors of SPEC §7 / docs/API_CONTRACT.md.
// Used until shared/openapi.json exists; at Gate 1 these become aliases of the
// generated types in ./schema.d.ts (`pnpm gen:api`). Field names must match the
// contract exactly (snake_case).

export type Utility = "WATER" | "SEWER" | "POWER" | "TELECOM" | "GAS";
export type WorkType = "TRENCH" | "PIT" | "HDD" | "PIPE_LAY";
export type ClashKind =
	| "INTERSECTION"
	| "CLEARANCE"
	| "SCHEDULE_OVERLAP"
	| "DIG_ONCE";
export type Certainty = "LIKELY" | "POSSIBLE" | "NEEDS_DATA";
export type SeverityBand = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type ReviewStatus = "OPEN" | "ACKNOWLEDGED" | "ESCALATED" | "DISMISSED";
export type CaptureMethod = "SURVEYED" | "AS_BUILT" | "DIGITISED" | "ESTIMATED";
export type Origin = "SEED" | "INTAKE";

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

export interface Bounds {
	min_x: number;
	min_y: number;
	max_x: number;
	max_y: number;
}

export interface Street {
	id: string;
	name: string;
	centerline: Point2[];
	width_m: number;
}

export interface Junction {
	id: string;
	name: string;
	x: number;
	y: number;
}

export interface Landmark {
	id: string;
	name: string;
	x: number;
	y: number;
}

export interface SourceRecord {
	record_id: string;
	source: string;
	captured_on: string;
	method: CaptureMethod;
}

export interface Asset {
	id: string;
	utility: Utility;
	owner: string;
	label: string;
	path: Point3[];
	diameter_m: number;
	horiz_precision_m: number;
	depth_precision_m: number | null;
	depth_known: boolean;
	source_record: SourceRecord;
}

export interface SourcePermit {
	permit_no: string;
	source: string;
	submitted_on: string;
}

export interface Work {
	id: string;
	title: string;
	agency: string;
	work_type: WorkType;
	utility: Utility | null;
	path: Point2[];
	width_m: number;
	depth_from_m: number;
	depth_to_m: number;
	bore_path: Point3[] | null;
	bore_diameter_m: number | null;
	start_date: string;
	end_date: string;
	source_permit: SourcePermit;
	origin: Origin;
	field_confidence: Record<string, number>;
	missing_fields: string[];
}

export interface Scene {
	area: { name: string; bounds: Bounds };
	streets: Street[];
	junctions: Junction[];
	landmarks: Landmark[];
	assets: Asset[];
	works: Work[];
}

export interface SeverityFactors {
	hazard: number;
	breach: number;
	urgency: number;
	confidence: number;
}

export interface Severity {
	score: number;
	band: SeverityBand;
	factors: SeverityFactors;
}

export interface Evidence {
	type: string;
	ref: string;
	detail: string;
}

export interface Review {
	status: ReviewStatus;
	reviewer: string | null;
	note: string | null;
	updated_at: string | null;
}

export interface Clash {
	id: string;
	kind: ClashKind;
	certainty: Certainty;
	severity: Severity;
	work_ids: string[];
	asset_ids: string[];
	location: { x: number; y: number; z: number };
	measured_gap_m: number | null;
	required_clearance_m: number | null;
	uncertainty_m: number | null;
	rule_id: string | null;
	schedule: { overlap_days: number; gap_days: number } | null;
	explanation: string;
	evidence: Evidence[];
	missing_data: string[];
	group_id: string;
	review: Review;
	baseline_flagged: boolean;
}

export interface Rule {
	id: string;
	applies_to: { work_types: WorkType[]; utility: Utility | null };
	min_clearance_m: number;
	label: string;
}

export interface ClashDetail {
	clash: Clash;
	assets: Asset[];
	works: Work[];
	// The contract always returns a rule. `null` only happens in mock mode,
	// because shared/mocks has no rules file. Remove the `| null` when switching
	// to the generated schema.d.ts at Gate 1.
	rule: Rule | null;
}

export interface ClashGroup {
	id: string;
	title: string;
	clash_ids: string[];
	work_ids: string[];
	max_severity_score: number;
	review_rank: number;
}

export interface ListResponse<T> {
	items: T[];
	total: number;
}

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

export interface ApiErrorBody {
	detail: string;
	code: string;
}
