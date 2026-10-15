import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";

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

function describe(error: unknown): { code: string; detail: string } {
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
	const { code, detail } = describe(error);
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
