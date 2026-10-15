import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	getClash,
	getClashes,
	getGroups,
	getScene,
	getSummary,
	reviewClash,
} from "./client";
import type { ClashDetail, ClashQuery, ReviewRequest } from "./types";

export const queryKeys = {
	scene: ["scene"] as const,
	clashes: (query: ClashQuery = {}) => ["clashes", query] as const,
	clash: (id: string) => ["clash", id] as const,
	groups: ["groups"] as const,
	summary: ["summary"] as const,
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
