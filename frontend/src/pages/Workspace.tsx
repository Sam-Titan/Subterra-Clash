import { useClashes, useScene } from "@/api/hooks";
import { ErrorBlock, LoadingBlock } from "@/components/QueryState";
import { formatClearance, humanizeEnum } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

// Placeholder that exercises the data layer; the 3D scene and left rail come in 1F.
export default function Workspace() {
	const scene = useScene();
	const clashes = useClashes();
	const selectedClashId = useAppStore((s) => s.selectedClashId);
	const selectClash = useAppStore((s) => s.selectClash);

	return (
		<section className="flex flex-col gap-4 p-6">
			<h1 className="text-xl font-semibold">Workspace</h1>

			{scene.isPending ? (
				<LoadingBlock label="Loading scene…" />
			) : scene.isError ? (
				<ErrorBlock
					title="Could not load the scene"
					error={scene.error}
					onRetry={() => scene.refetch()}
				/>
			) : (
				<p className="text-sm text-zinc-400">
					{scene.data.area.name}: {scene.data.streets.length} streets,{" "}
					{scene.data.assets.length} assets, {scene.data.works.length} works.
				</p>
			)}

			{clashes.isPending ? (
				<LoadingBlock label="Loading clashes…" />
			) : clashes.isError ? (
				<ErrorBlock
					title="Could not load clashes"
					error={clashes.error}
					onRetry={() => clashes.refetch()}
				/>
			) : (
				<ul className="flex flex-col gap-1 text-sm">
					{clashes.data.items.map((c) => (
						<li key={c.id}>
							<button
								type="button"
								onClick={() => selectClash(c.id)}
								className={
									c.id === selectedClashId
										? "rounded px-2 py-1 text-left bg-zinc-800"
										: "rounded px-2 py-1 text-left hover:bg-zinc-900"
								}
							>
								<span className="font-mono">{c.id}</span> ·{" "}
								{humanizeEnum(c.kind)} · {humanizeEnum(c.certainty)} ·{" "}
								{formatClearance(c.measured_gap_m, c.required_clearance_m)}
							</button>
						</li>
					))}
				</ul>
			)}

			<p className="text-xs text-zinc-500">
				Selected clash: {selectedClashId ?? "none"}
			</p>
		</section>
	);
}
