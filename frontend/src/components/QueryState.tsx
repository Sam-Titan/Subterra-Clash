import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Placeholder rows for lists and tables while their query loads. */
export function SkeletonRows({
	rows = 5,
	label = "Loading…",
	className,
}: {
	rows?: number;
	label?: string;
	className?: string;
}) {
	return (
		<div role="status" className={cn("flex flex-col gap-2", className)}>
			<span className="sr-only">{label}</span>
			{Array.from({ length: rows }, (_, i) => (
				<Skeleton
					// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
					key={i}
					className="h-9 bg-zinc-800/60"
					style={{ width: `${100 - (i % 3) * 8}%` }}
				/>
			))}
		</div>
	);
}

/** Placeholder stat tiles (dashboard, landing counters). */
export function SkeletonTiles({
	count = 4,
	label = "Loading…",
	className,
}: {
	count?: number;
	label?: string;
	className?: string;
}) {
	return (
		<div role="status" className={cn("grid gap-3", className)}>
			<span className="sr-only">{label}</span>
			{Array.from({ length: count }, (_, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
					key={i}
					className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
				>
					<Skeleton className="h-3 w-24 bg-zinc-800/80" />
					<Skeleton className="h-8 w-14 bg-zinc-800/80" />
				</div>
			))}
		</div>
	);
}

/** Fills the 3D view area while the scene data or the three.js chunk loads. */
export function SceneSkeleton({
	label = "Loading scene…",
}: {
	label?: string;
}) {
	return (
		<div
			role="status"
			className="relative flex size-full items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30"
		>
			<Skeleton className="absolute inset-x-8 top-1/2 h-px -translate-y-8 bg-zinc-800" />
			<Skeleton className="absolute inset-x-8 top-1/2 h-px bg-zinc-800" />
			<Skeleton className="absolute inset-y-8 left-1/3 w-px bg-zinc-800" />
			<Skeleton className="absolute inset-y-8 left-2/3 w-px bg-zinc-800" />
			<span className="relative flex items-center gap-2 rounded-md bg-zinc-950/80 px-3 py-1.5 text-sm text-zinc-400">
				<Loader2 className="size-4 animate-spin" aria-hidden />
				{label}
			</span>
		</div>
	);
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
	return (
		<div
			role="status"
			className="flex min-h-32 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400"
		>
			<Loader2 className="size-4 animate-spin" aria-hidden />
			{label}
		</div>
	);
}

export function describeError(error: unknown): {
	code: string;
	detail: string;
} {
	if (error instanceof ApiError)
		return { code: error.code, detail: error.detail };
	if (error instanceof Error)
		return { code: "UNEXPECTED", detail: error.message };
	return { code: "UNEXPECTED", detail: "Something went wrong." };
}

export function ErrorBlock({
	error,
	onRetry,
	title = "Could not load data",
}: {
	error: unknown;
	onRetry?: () => void;
	title?: string;
}) {
	const { code, detail } = describeError(error);
	return (
		<div
			role="alert"
			className="flex flex-col gap-3 rounded-lg border border-zinc-700 bg-zinc-900/60 p-6 text-sm"
		>
			<div className="flex items-center gap-2 font-medium text-zinc-100">
				<AlertTriangle className="size-4 text-zinc-300" aria-hidden />
				{title}
			</div>
			<p className="text-zinc-400">{detail}</p>
			<code className="font-mono text-xs text-zinc-500">{code}</code>
			{onRetry && (
				<Button
					variant="outline"
					size="sm"
					className="w-fit border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800"
					onClick={onRetry}
				>
					<RotateCw className="size-3.5" aria-hidden />
					Retry
				</Button>
			)}
		</div>
	);
}
