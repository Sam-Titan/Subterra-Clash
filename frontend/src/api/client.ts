import type {
	ApiErrorBody,
	Clash,
	ClashDetail,
	ClashGroup,
	ClashQuery,
	ListResponse,
	ReviewRequest,
	ReviewResponse,
	Scene,
	Summary,
} from "./types";

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

/** Every failed request becomes an ApiError, so error UI always has a message. */
export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly detail: string;

	constructor(status: number, code: string, detail: string) {
		super(`${code}: ${detail}`);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.detail = detail;
	}
}

function isErrorBody(value: unknown): value is ApiErrorBody {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as ApiErrorBody).detail === "string" &&
		typeof (value as ApiErrorBody).code === "string"
	);
}

const GENERIC_ROUTE_CODES = new Set(["NOT_FOUND", "METHOD_NOT_ALLOWED"]);

type QueryParams = Record<string, string | number | undefined>;

function buildUrl(path: string, params?: QueryParams): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params ?? {})) {
		if (value !== undefined) search.set(key, String(value));
	}
	const qs = search.toString();
	return `/api${path}${qs ? `?${qs}` : ""}`;
}

async function request<T>(
	method: "GET" | "POST",
	path: string,
	{ params, body: payload }: { params?: QueryParams; body?: unknown } = {},
): Promise<T> {
	const url = buildUrl(path, params);
	const headers: Record<string, string> = { Accept: "application/json" };
	if (payload !== undefined) headers["Content-Type"] = "application/json";

	let response: Response;
	try {
		response = await fetch(url, {
			method,
			headers,
			body: payload === undefined ? undefined : JSON.stringify(payload),
		});
	} catch {
		throw new ApiError(0, "NETWORK", `Could not reach the server for ${url}.`);
	}

	// Read as text first: with the backend down, the Vite proxy answers with a
	// plain-text 500, which must not crash JSON parsing.
	let text: string;
	try {
		text = await response.text();
	} catch {
		throw new ApiError(
			response.status,
			"NETWORK",
			`Connection dropped while reading ${url}.`,
		);
	}

	let body: unknown;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		throw new ApiError(
			response.status,
			"BAD_RESPONSE",
			response.ok
				? `Server returned non-JSON data for ${url}.`
				: `Server error ${response.status} for ${url} (backend may be offline).`,
		);
	}

	if (!response.ok) {
		// A route the backend does not have yet answers with the router's
		// generic 404/405 ({detail, code: NOT_FOUND | METHOD_NOT_ALLOWED}, or a
		// bare body); specific codes such as CLASH_NOT_FOUND pass through.
		const missingRoute =
			(response.status === 404 || response.status === 405) &&
			(!isErrorBody(body) || GENERIC_ROUTE_CODES.has(body.code));
		if (missingRoute) {
			throw new ApiError(
				response.status,
				"NOT_AVAILABLE",
				`${method} ${url} is not available on this backend yet.`,
			);
		}
		if (isErrorBody(body)) {
			throw new ApiError(response.status, body.code, body.detail);
		}
		throw new ApiError(
			response.status,
			"BAD_RESPONSE",
			`Server error ${response.status} for ${url}.`,
		);
	}

	return body as T;
}

export function apiGet<T>(path: string, params?: QueryParams): Promise<T> {
	return request<T>("GET", path, { params });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
	return request<T>("POST", path, { body });
}

export async function getScene(): Promise<Scene> {
	if (USE_MOCKS) return (await import("./mocks")).mockScene();
	return apiGet<Scene>("/scene");
}

export async function getClashes(
	query: ClashQuery = {},
): Promise<ListResponse<Clash>> {
	if (USE_MOCKS) return (await import("./mocks")).mockClashes(query);
	return apiGet<ListResponse<Clash>>("/clashes", { ...query });
}

export async function getClash(id: string): Promise<ClashDetail> {
	if (USE_MOCKS) return (await import("./mocks")).mockClash(id);
	return apiGet<ClashDetail>(`/clashes/${encodeURIComponent(id)}`);
}

export async function getGroups(): Promise<ListResponse<ClashGroup>> {
	if (USE_MOCKS) return (await import("./mocks")).mockGroups();
	return apiGet<ListResponse<ClashGroup>>("/groups");
}

export async function reviewClash(
	id: string,
	body: ReviewRequest,
): Promise<ReviewResponse> {
	if (USE_MOCKS) return (await import("./mocks")).mockReview(id, body);
	return apiPost<ReviewResponse>(
		`/clashes/${encodeURIComponent(id)}/review`,
		body,
	);
}

export async function getSummary(): Promise<Summary> {
	if (USE_MOCKS) return (await import("./mocks")).mockSummary();
	return apiGet<Summary>("/summary");
}
