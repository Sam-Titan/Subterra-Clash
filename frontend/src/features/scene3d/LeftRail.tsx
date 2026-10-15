import { RotateCcw } from "lucide-react";
import { useId, useMemo } from "react";
import { useClashes, useScene } from "@/api/hooks";
import { CERTAINTIES, type Certainty, UTILITIES } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
	CERTAINTY_COLORS,
	CERTAINTY_STYLE,
	SCENE_COLORS,
	UTILITY_COLORS,
	WORK_COLOR,
} from "@/lib/colors";
import { humanizeEnum, utilityLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type LayerId, useAppStore } from "@/store/useAppStore";

function SectionTitle({ children }: { children: string }) {
	return (
		<h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
			{children}
		</h2>
	);
}

function SwitchRow({
	label,
	swatch,
	count,
	checked,
	onChange,
	hint,
}: {
	label: string;
	swatch?: string;
	count?: number;
	checked: boolean;
	onChange: (on: boolean) => void;
	hint?: string;
}) {
	const id = useId();
	return (
		<div className="flex items-center gap-2 py-1">
			{swatch && (
				<span
					aria-hidden
					className="size-2.5 shrink-0 rounded-full"
					style={{ backgroundColor: swatch }}
				/>
			)}
			<label htmlFor={id} className="flex-1 cursor-pointer text-sm">
				{label}
				{hint && (
					<span className="block text-[11px] text-zinc-500">{hint}</span>
				)}
			</label>
			{count !== undefined && (
				<span className="font-mono text-xs tabular-nums text-zinc-500">
					{count}
				</span>
			)}
			<Switch
				id={id}
				checked={checked}
				onCheckedChange={onChange}
				className="scale-75"
			/>
		</div>
	);
}

/** Small CSS rendition of the 3D marker style, for the filter and legend. */
function MarkerGlyph({ certainty }: { certainty: Certainty }) {
	const color = CERTAINTY_COLORS[certainty];
	const style = CERTAINTY_STYLE[certainty];
	if (style === "dashed-ring")
		return (
			<span
				aria-hidden
				className="flex size-3.5 items-center justify-center rounded-full border border-dashed"
				style={{ borderColor: color }}
			>
				<span
					className="size-1 rounded-full"
					style={{ backgroundColor: color }}
				/>
			</span>
		);
	if (style === "question")
		return (
			<span
				aria-hidden
				className="flex size-3.5 items-center justify-center rounded-full text-[9px] font-bold text-zinc-950"
				style={{ backgroundColor: color }}
			>
				?
			</span>
		);
	return (
		<span
			aria-hidden
			className="size-2.5 rounded-full"
			style={{
				backgroundColor: color,
				boxShadow: `0 0 0 2px ${SCENE_COLORS.background}, 0 0 0 3px ${color}`,
			}}
		/>
	);
}

/** Layer toggles, certainty filter, x-ray and halo switches (SPEC §10.2). */
export function LeftRail() {
	const scene = useScene();
	const clashes = useClashes();

	const layers = useAppStore((s) => s.layers);
	const setLayer = useAppStore((s) => s.setLayer);
	const xray = useAppStore((s) => s.xray);
	const setXray = useAppStore((s) => s.setXray);
	const halos = useAppStore((s) => s.halos);
	const setHalos = useAppStore((s) => s.setHalos);
	const certaintyFilter = useAppStore((s) => s.certaintyFilter);
	const toggleCertainty = useAppStore((s) => s.toggleCertainty);
	const resetFilters = useAppStore((s) => s.resetFilters);

	const assetCounts = useMemo(() => {
		const counts = new Map<LayerId, number>();
		for (const a of scene.data?.assets ?? [])
			counts.set(a.utility, (counts.get(a.utility) ?? 0) + 1);
		counts.set("WORKS", scene.data?.works.length ?? 0);
		return counts;
	}, [scene.data]);

	const unknownDepth = useMemo(
		() => scene.data?.assets.filter((a) => !a.depth_known).length ?? 0,
		[scene.data],
	);

	const certaintyCounts = useMemo(() => {
		const counts = new Map<Certainty, number>();
		for (const c of clashes.data?.items ?? [])
			counts.set(c.certainty, (counts.get(c.certainty) ?? 0) + 1);
		return counts;
	}, [clashes.data]);

	const loaded = scene.isSuccess;

	return (
		<aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-4">
			<section className="flex flex-col gap-1">
				<SectionTitle>Layers</SectionTitle>
				{UTILITIES.map((u) => (
					<SwitchRow
						key={u}
						label={utilityLabel(u)}
						swatch={UTILITY_COLORS[u]}
						count={loaded ? (assetCounts.get(u) ?? 0) : undefined}
						checked={layers[u]}
						onChange={(on) => setLayer(u, on)}
					/>
				))}
				<SwitchRow
					label="Proposed works"
					swatch={WORK_COLOR}
					count={loaded ? (assetCounts.get("WORKS") ?? 0) : undefined}
					checked={layers.WORKS}
					onChange={(on) => setLayer("WORKS", on)}
				/>
				{unknownDepth > 0 && (
					<p className="text-[11px] text-zinc-500">
						{unknownDepth} asset{unknownDepth === 1 ? "" : "s"} with unknown
						depth, drawn faded at a placeholder depth.
					</p>
				)}
			</section>

			<Separator className="bg-zinc-800" />

			<section className="flex flex-col gap-2">
				<SectionTitle>Certainty</SectionTitle>
				<div className="flex flex-col gap-1">
					{CERTAINTIES.map((c) => {
						const on = certaintyFilter.includes(c);
						return (
							<button
								key={c}
								type="button"
								aria-pressed={on}
								onClick={() => toggleCertainty(c)}
								className={cn(
									"flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors",
									on
										? "border-zinc-700 bg-zinc-900 text-zinc-100"
										: "border-zinc-900 text-zinc-500 hover:border-zinc-800",
								)}
							>
								<span className={on ? "" : "opacity-40"}>
									<MarkerGlyph certainty={c} />
								</span>
								<span className="flex-1">{humanizeEnum(c)}</span>
								<span className="font-mono text-xs tabular-nums text-zinc-500">
									{clashes.isSuccess ? (certaintyCounts.get(c) ?? 0) : "–"}
								</span>
							</button>
						);
					})}
				</div>
				<p className="text-[11px] text-zinc-500">
					Hiding a layer never hides its clashes; only this filter does.
				</p>
			</section>

			<Separator className="bg-zinc-800" />

			<section className="flex flex-col gap-1">
				<SectionTitle>View</SectionTitle>
				<SwitchRow
					label="X-ray"
					hint="See-through ground"
					checked={xray}
					onChange={setXray}
				/>
				<SwitchRow
					label="Uncertainty halos"
					hint="Diameter / 2 + horizontal precision"
					checked={halos}
					onChange={setHalos}
				/>
			</section>

			<Button
				variant="outline"
				size="sm"
				onClick={resetFilters}
				className="mt-auto border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800"
			>
				<RotateCcw className="size-3.5" aria-hidden />
				Reset filters
			</Button>
		</aside>
	);
}
