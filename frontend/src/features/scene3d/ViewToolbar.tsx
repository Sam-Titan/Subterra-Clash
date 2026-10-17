import { Footprints, Map as MapIcon, Scissors } from "lucide-react";
import type { Street } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { defaultStreetId } from "./city/cityLayout";

/**
 * Camera presets over the 3D view (SPEC §10.2): Street level on a chosen
 * street (default Station Road) and Overview. Street level turns x-ray off so
 * the reveal is the next click.
 */
export function ViewToolbar({ streets }: { streets: readonly Street[] }) {
	const viewMode = useAppStore((s) => s.viewMode);
	const requestView = useAppStore((s) => s.requestView);
	const streetViewId = useAppStore((s) => s.streetViewId);
	const setStreetViewId = useAppStore((s) => s.setStreetViewId);
	const xray = useAppStore((s) => s.xray);
	const setXray = useAppStore((s) => s.setXray);
	const cityOn = useAppStore((s) => s.layers.CITY);
	const sectionEnabled = useAppStore((s) => s.sectionEnabled);
	const setSectionEnabled = useAppStore((s) => s.setSectionEnabled);

	const streetId = streetViewId ?? defaultStreetId(streets) ?? "";
	const base =
		"h-8 border-zinc-700 bg-zinc-950/90 text-zinc-200 hover:bg-zinc-800";
	const active = "border-zinc-400 bg-zinc-800 text-zinc-50";

	return (
		<div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 p-1.5 shadow-lg backdrop-blur">
			<Select
				value={streetId}
				onValueChange={(id) => {
					setStreetViewId(id);
					if (viewMode === "street") requestView("street");
				}}
				disabled={streets.length === 0}
			>
				<SelectTrigger
					aria-label="Street for the street-level view"
					className="h-8 w-40 border-zinc-700 bg-zinc-950/90 text-xs text-zinc-200"
				>
					<SelectValue placeholder="Street" />
				</SelectTrigger>
				<SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-100">
					{streets.map((s) => (
						<SelectItem key={s.id} value={s.id}>
							{s.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				variant="outline"
				size="sm"
				aria-pressed={viewMode === "street"}
				className={cn(base, viewMode === "street" && active)}
				onClick={() => requestView("street")}
				disabled={streets.length === 0}
			>
				<Footprints className="size-3.5" aria-hidden />
				Street level
			</Button>
			<Button
				variant="outline"
				size="sm"
				aria-pressed={viewMode === "overview"}
				className={cn(base, viewMode === "overview" && active)}
				onClick={() => requestView("overview")}
			>
				<MapIcon className="size-3.5" aria-hidden />
				Overview
			</Button>
			<Button
				variant="outline"
				size="sm"
				aria-pressed={xray}
				className={cn(base, xray && active)}
				onClick={() => setXray(!xray)}
				title={
					cityOn
						? "Fade the road and buildings to see underground"
						: "See-through ground"
				}
			>
				X-ray
			</Button>
			<Button
				variant="outline"
				size="sm"
				aria-pressed={sectionEnabled}
				className={cn(base, sectionEnabled && active)}
				onClick={() => setSectionEnabled(!sectionEnabled)}
				title="Cut the ground along a plane and show the cross-section below"
			>
				<Scissors className="size-3.5" aria-hidden />
				Section
			</Button>
		</div>
	);
}
