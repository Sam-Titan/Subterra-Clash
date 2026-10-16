import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	commitPermit,
	getClash,
	getClashes,
	getGroups,
	getHealth,
	getPermitSamples,
	getReport,
	getScene,
	getSummary,
	parsePermitPdf,
	parsePermitText,
	patchPermit,
	reviewClash,
} from "./client";
import type {
	ClashDetail,
	ClashQuery,
	CommitResponse,
	PatchDraftRequest,
	PermitDraft,
	ReviewRequest,
} from "./types";

export const queryKeys = {
	scene: ["scene"] as const,
	clashes: (query: ClashQuery = {}) => ["clashes", query] as const,
	clash: (id: string) => ["clash", id] as const,
	groups: ["groups"] as const,
	summary: ["summary"] as const,
	health: ["health"] as const,
	permitSamples: ["permit-samples"] as const,
	/** The draft being worked on in /intake (client-held, never fetched). */
	intake: ["intake-session"] as const,
};

export function useScene() {
	return useQuery({ queryKey: queryKeys.scene, queryFn: getScene });
}

export function useClashes(query: ClashQuery = {}) {
	return useQuery({
		queryKey: queryKeys.clashes(query),
		queryFn: () => getClashes(query),
	});
}

export function useClash(id: string | null) {
	return useQuery({
		queryKey: queryKeys.clash(id ?? ""),
		queryFn: () => getClash(id ?? ""),
		enabled: id !== null,
	});
}

export function useGroups() {
	return useQuery({ queryKey: queryKeys.groups, queryFn: getGroups });
}

/** Backend health; `demo_date` is the engine's "today". Null in mock mode. */
export function useHealth() {
	return useQuery({
		queryKey: queryKeys.health,
		queryFn: getHealth,
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useSummary() {
	return useQuery({ queryKey: queryKeys.summary, queryFn: getSummary });
}

/**
 * Record a review decision. The returned clash replaces the cached detail;
 * lists, groups and summary counts are refetched.
 */
export function useReviewClash() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, body }: { id: string; body: ReviewRequest }) =>
			reviewClash(id, body),
		onSuccess: ({ clash }) => {
			queryClient.setQueryData<ClashDetail>(queryKeys.clash(clash.id), (old) =>
				old ? { ...old, clash } : old,
			);
			queryClient.invalidateQueries({ queryKey: ["clashes"] });
			queryClient.invalidateQueries({ queryKey: queryKeys.groups });
			queryClient.invalidateQueries({ queryKey: queryKeys.summary });
		},
	});
}

/** Fetch the inspection report (HTML or CSV) as a Blob; the caller shows it. */
export function useReport() {
	return useMutation({ mutationFn: getReport });
}

export function usePermitSamples() {
	return useQuery({
		queryKey: queryKeys.permitSamples,
		queryFn: getPermitSamples,
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/** The current intake draft and, once added to the plan, the commit result. */
export interface IntakeSession {
	draft: PermitDraft;
	committed: CommitResponse | null;
}

/**
 * The draft lives in the query cache (not component state) so it survives
 * leaving /intake and coming back. It is only ever written by the mutations.
 */
export function useIntakeSession() {
	return useQuery<IntakeSession | null>({
		queryKey: queryKeys.intake,
		queryFn: () => null,
		enabled: false,
		initialData: null,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
	}).data;
}

export function useClearIntakeSession() {
	const queryClient = useQueryClient();
	return () => queryClient.setQueryData(queryKeys.intake, null);
}

export type ParseInput = { text: string } | { file: File };

export function useParsePermit() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: ParseInput) =>
			"file" in input
				? parsePermitPdf(input.file)
				: parsePermitText(input.text),
		onSuccess: (draft) =>
			queryClient.setQueryData<IntakeSession>(queryKeys.intake, {
				draft,
				committed: null,
			}),
	});
}

export function usePatchPermit() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			draftId,
			fields,
		}: {
			draftId: string;
			fields: PatchDraftRequest["fields"];
		}) => patchPermit(draftId, fields),
		onSuccess: (draft) =>
			queryClient.setQueryData<IntakeSession>(queryKeys.intake, {
				draft,
				committed: null,
			}),
	});
}

/** On success the plan changed: scene, clashes, groups and summary refetch. */
export function useCommitPermit() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			draftId,
			reviewer,
		}: {
			draftId: string;
			reviewer: string;
		}) => commitPermit(draftId, { reviewer }),
		onSuccess: (committed) => {
			queryClient.setQueryData<IntakeSession | null>(queryKeys.intake, (old) =>
				old ? { ...old, committed } : old,
			);
			queryClient.invalidateQueries({ queryKey: queryKeys.scene });
			queryClient.invalidateQueries({ queryKey: ["clashes"] });
			queryClient.invalidateQueries({ queryKey: ["clash"] });
			queryClient.invalidateQueries({ queryKey: queryKeys.groups });
			queryClient.invalidateQueries({ queryKey: queryKeys.summary });
		},
	});
}
