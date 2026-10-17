import { Layers, ListFilter, RotateCcw } from "lucide-react";
import { type ReactNode, useId, useMemo } from "react";
import { useClashes, useScene } from "@/api/hooks";
import { CERTAINTIES, type Certainty, UTILITIES } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	CERTAINTY_COLORS,
	CERTAINTY_STYLE,
	CITY_COLORS,
	SCENE_COLORS,
	UTILITY_COLORS,
	WORK_COLOR,
} from "@/lib/colors";
import { humanizeEnum, utilityLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type LayerId, useAppStore } from "@/store/useAppStore";

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
	/** "loading" shows a placeholder while the scene loads. */
	count?: number | "loading";
	checked: boolean;
	onChange: (on: boolean) => void;
	hint?: string;
}) {
	const id = useId();
	return (
		<div className="flex items-center gap-2 py-1">
			<span
				aria-hidden
				className="size-2.5 shrink-0 rounded-full"
				style={swatch ? { backgroundColor: swatch } : undefined}
			/>
			<label htmlFor={id} className="flex-1 cursor-pointer text-sm">
				{label}
				{hint && <span className="block text-xs text-zinc-400">{hint}</span>}
			</label>
			{count === "loading" ? (
				<Skeleton className="h-3 w-4 bg-zinc-800" />
			) : (
				count !== undefined && (
					<span className="font-mono text-xs tabular-nums text-zinc-400">
						{count}
					</span>
				)
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
				className="flex size-3.5 items-center justify-center rounded-full text-xs font-bold leading-none text-zinc-950"
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

/** One icon in the toolbar that opens its controls in a popover. */
function RailPopover({
	label,
	icon,
	active,
	children,
}: {
	label: string;
	icon: ReactNode;
	/** Something inside differs from the default: show a dot on the icon. */
	active: boolean;
	children: ReactNode;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={active ? `${label} (changed)` : label}
					title={label}
					className="relative size-9 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 data-[state=open]:bg-zinc-800 data-[state=open]:text-zinc-50"
				>
					{icon}
					{active && (
						<span
							aria-hidden
							className="absolute top-1.5 right-1.5 size-2 rounded-full bg-zinc-50 ring-2 ring-zinc-950"
						/>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				side="right"
				align="start"
				sideOffset={8}
				className="w-72 border-zinc-800 bg-zinc-900 p-3 text-zinc-100"
			>
				<h2 className="mb-1 text-sm font-semibold">{label}</h2>
				{children}
			</PopoverContent>
		</Popover>
	);
}

/**
 * Icon toolbar for what the 3D view shows: layers (and halos) and the
 * certainty filter. X-ray, Section and camera presets live in the view toolbar
 * over the canvas.
 */
export function LeftRail() {
	const scene = useScene();
	const clashes = useClashes();

	const layers = useAppStore((s) => s.layers);
	const setLayer = useAppStore((s) => s.setLayer);
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
	const pendingCount = scene.isPending ? ("loading" as const) : undefined;
	const layersChanged = Object.values(layers).some((on) => !on) || !halos;
	const filterChanged = certaintyFilter.length !== CERTAINTIES.length;

	return (
		<aside
			aria-label="Scene controls"
			className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-zinc-800 bg-zinc-950 py-2"
		>
			<RailPopover
				label="Layers"
				icon={<Layers className="size-5" aria-hidden />}
				active={layersChanged}
			>
				<div className="flex flex-col">
					{UTILITIES.map((u) => (
						<SwitchRow
							key={u}
							label={utilityLabel(u)}
							swatch={UTILITY_COLORS[u]}
							count={loaded ? (assetCounts.get(u) ?? 0) : pendingCount}
							checked={layers[u]}
							onChange={(on) => setLayer(u, on)}
						/>
					))}
					<SwitchRow
						label="Proposed works"
						swatch={WORK_COLOR}
						count={loaded ? (assetCounts.get("WORKS") ?? 0) : pendingCount}
						checked={layers.WORKS}
						onChange={(on) => setLayer("WORKS", on)}
					/>
					<SwitchRow
						label="City context"
						hint="Roads, buildings, street furniture"
						swatch={CITY_COLORS.footpath}
						checked={layers.CITY}
						onChange={(on) => setLayer("CITY", on)}
					/>
					<SwitchRow
						label="Uncertainty halos"
						hint="Diameter / 2 + horizontal precision"
						checked={halos}
						onChange={setHalos}
					/>
				</div>
				{unknownDepth > 0 && (
					<p className="mt-2 text-xs text-zinc-400">
						{unknownDepth} asset{unknownDepth === 1 ? "" : "s"} with unknown
						depth, drawn faded at a placeholder depth.
					</p>
				)}
			</RailPopover>

			<RailPopover
				label="Certainty"
				icon={<ListFilter className="size-5" aria-hidden />}
				active={filterChanged}
			>
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
										? "border-zinc-700 bg-zinc-800 text-zinc-100"
										: "border-zinc-800 text-zinc-400 hover:border-zinc-700",
								)}
							>
								<span className={on ? "" : "opacity-40"}>
									<MarkerGlyph certainty={c} />
								</span>
								<span className="flex-1">{humanizeEnum(c)}</span>
								<span className="font-mono text-xs tabular-nums text-zinc-400">
									{clashes.isSuccess ? (
										(certaintyCounts.get(c) ?? 0)
									) : clashes.isError ? (
										"–"
									) : (
										<Skeleton className="inline-block h-3 w-4 bg-zinc-800 align-middle" />
									)}
								</span>
							</button>
						);
					})}
				</div>
				<p className="mt-2 text-xs text-zinc-400">
					Hiding a layer never hides its clashes; only this filter does.
				</p>
			</RailPopover>

			<Button
				variant="ghost"
				size="icon"
				onClick={resetFilters}
				aria-label="Reset filters"
				title="Reset filters"
				className="mt-auto size-9 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
			>
				<RotateCcw className="size-5" aria-hidden />
			</Button>
		</aside>
	);
}
