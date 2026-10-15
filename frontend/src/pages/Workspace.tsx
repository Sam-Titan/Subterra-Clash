import { Loader2, X } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";
import { useClashes, useScene } from "@/api/hooks";
import { ErrorBlock, LoadingBlock } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeftRail } from "@/features/scene3d/LeftRail";
import { humanizeEnum } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

// three.js is heavy; keep it out of the main bundle until the workspace opens.
const SceneCanvas = lazy(() => import("@/features/scene3d/SceneCanvas"));

function SelectedChip() {
	const clashes = useClashes();
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const selectClash = useAppStore((s) => s.selectClash);
	const clash = clashes.data?.items.find((c) => c.id === selectedClashId);
	if (!selectedClashId) return null;
	return (
		<div className="pointer-events-auto flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950/90 py-1 pr-1 pl-3 text-sm backdrop-blur">
			<span className="font-mono">{selectedClashId}</span>
			{clash && (
				<span className="text-zinc-400">
					{humanizeEnum(clash.kind)} · {humanizeEnum(clash.certainty)}
				</span>
			)}
			<Button
				variant="ghost"
				size="icon"
				className="size-6 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
				onClick={() => selectClash(null)}
				aria-label="Clear selection"
			>
				<X className="size-3.5" aria-hidden />
			</Button>
		</div>
	);
}

export default function Workspace() {
	const scene = useScene();
	const clashes = useClashes();
	const items = useMemo(() => clashes.data?.items ?? [], [clashes.data]);

	return (
		<section className="flex min-h-[560px] flex-1">
			<LeftRail />

			<div className="relative flex-1 bg-zinc-950">
				{scene.isPending ? (
					<div className="absolute inset-0 p-6">
						<LoadingBlock label="Loading scene…" />
					</div>
				) : scene.isError ? (
					<div className="absolute inset-0 p-6">
						<ErrorBlock
							title="Could not load the scene"
							error={scene.error}
							onRetry={() => scene.refetch()}
						/>
					</div>
				) : (
					<Suspense
						fallback={
							<div className="absolute inset-0 p-6">
								<LoadingBlock label="Loading 3D view…" />
							</div>
						}
					>
						<div className="absolute inset-0">
							<SceneCanvas scene={scene.data} clashes={items} />
						</div>
					</Suspense>
				)}

				<div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-2">
					{clashes.isPending && (
						<Badge
							variant="outline"
							className="gap-1.5 border-zinc-700 bg-zinc-950/90 text-zinc-300"
						>
							<Loader2 className="size-3 animate-spin" aria-hidden />
							Loading clashes…
						</Badge>
					)}
					{clashes.isError && (
						<div className="pointer-events-auto w-80">
							<ErrorBlock
								title="Could not load clashes"
								error={clashes.error}
								onRetry={() => clashes.refetch()}
							/>
						</div>
					)}
					<SelectedChip />
				</div>
			</div>
		</section>
	);
}
