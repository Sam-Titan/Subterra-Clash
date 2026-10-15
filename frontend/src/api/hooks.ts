import { useQuery } from "@tanstack/react-query";
import {
	getClash,
	getClashes,
	getGroups,
	getScene,
	getSummary,
} from "./client";
import type { ClashQuery } from "./types";

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
