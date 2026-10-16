import { Loader2 } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";
import { useClashes, useScene } from "@/api/hooks";
import { ErrorBlock, LoadingBlock } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { ClashPanel } from "@/features/clashes/ClashPanel";
import { ConflictList } from "@/features/clashes/ConflictList";
import { IntakeBanner } from "@/features/permits/IntakeBanner";
import { LeftRail } from "@/features/scene3d/LeftRail";
import { CrossSection } from "@/features/section/CrossSection";
import {
	useResolvedSection,
	useSectionCut,
	useSectionFollowsSelection,
} from "@/features/section/useSection";
import { useAppStore } from "@/store/useAppStore";

// three.js is heavy; keep it out of the main bundle until the workspace opens.
const SceneCanvas = lazy(() => import("@/features/scene3d/SceneCanvas"));

export default function Workspace() {
	const scene = useScene();
	const clashes = useClashes();
	const items = useMemo(() => clashes.data?.items ?? [], [clashes.data]);
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const sectionEnabled = useAppStore((s) => s.sectionEnabled);

	useSectionFollowsSelection(scene.data, items);
	const section = useResolvedSection(scene.data);
	const cut = useSectionCut(sectionEnabled ? scene.data : undefined, section);
	const sectionView = useMemo(
		() =>
			sectionEnabled && section && cut
				? { state: section, depth: cut.maxDepth }
				: null,
		[sectionEnabled, section, cut],
	);

	return (
		<section className="flex min-h-[560px] flex-1">
			<LeftRail />

			<div className="flex min-w-0 flex-1 flex-col">
				<div className="relative min-h-0 flex-1 bg-zinc-950">
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
								<SceneCanvas
									scene={scene.data}
									clashes={items}
									section={sectionView}
								/>
							</div>
						</Suspense>
					)}

					<div className="pointer-events-none absolute top-3 right-3 left-3 flex flex-col items-start gap-2">
						<IntakeBanner clashes={items} />
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
					</div>
				</div>
				{sectionEnabled && scene.data && section && cut && (
					<CrossSection
						scene={scene.data}
						clashes={items}
						section={section}
						cut={cut}
					/>
				)}
			</div>

			{/* Absolute inner box: the column scrolls on its own and never
			    stretches the row, so the canvas keeps the viewport height. */}
			<aside className="relative w-[340px] shrink-0 border-l border-zinc-800 bg-zinc-950 xl:w-[380px]">
				<div className="absolute inset-0 overflow-y-auto p-4">
					{selectedClashId ? (
						<ClashPanel clashId={selectedClashId} />
					) : (
						<ConflictList />
					)}
				</div>
			</aside>
		</section>
	);
}
