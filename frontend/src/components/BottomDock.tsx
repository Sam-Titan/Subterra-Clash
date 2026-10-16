import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type DockTab, useAppStore } from "@/store/useAppStore";

/**
 * Expanded dock height. One dock (not two stacked panels) keeps the 3D canvas
 * usable at 1366×768: about 568 px of workspace minus this leaves ~300 px.
 */
const DOCK_HEIGHT = "min(260px, 40vh)";

/** What the dock hands its active panel: the panel draws one shared bar. */
export interface DockChrome {
	tabs: ReactNode;
	actions: ReactNode;
	collapsed: boolean;
}

export interface DockTabSpec {
	id: DockTab;
	label: string;
	/** Unavailable tabs are not shown (e.g. cross-section while it is off). */
	available: boolean;
	render: (chrome: DockChrome) => ReactNode;
}

/** The bar every dock panel starts with: tabs · panel controls · collapse. */
export function DockBar({
	chrome,
	children,
}: {
	chrome: DockChrome;
	children?: ReactNode;
}) {
	return (
		<div className="flex h-10 shrink-0 items-center gap-3 border-b border-zinc-900 px-3">
			{chrome.tabs}
			<div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
			{chrome.actions}
		</div>
	);
}

/**
 * Workspace bottom dock: cross-section and schedule as tabs in one panel of
 * fixed height, collapsible to its bar. A tab that is not available falls back
 * to the first one that is.
 */
export function BottomDock({ tabs }: { tabs: DockTabSpec[] }) {
	const requested = useAppStore((s) => s.dockTab);
	const setDockTab = useAppStore((s) => s.setDockTab);
	const collapsed = useAppStore((s) => s.dockCollapsed);
	const setCollapsed = useAppStore((s) => s.setDockCollapsed);

	const shown = tabs.filter((t) => t.available);
	const active = shown.find((t) => t.id === requested) ?? shown[0];
	if (!active) return null;

	const tabList = (
		<div
			role="tablist"
			aria-label="Bottom panel"
			className="flex shrink-0 items-center gap-0.5 rounded-md bg-zinc-900 p-0.5"
		>
			{shown.map((t) => (
				<button
					key={t.id}
					type="button"
					role="tab"
					aria-selected={t.id === active.id}
					onClick={() => {
						setDockTab(t.id);
						if (collapsed) setCollapsed(false);
					}}
					className={cn(
						"rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-zinc-300",
						t.id === active.id
							? "bg-zinc-800 text-zinc-100"
							: "text-zinc-500 hover:text-zinc-300",
					)}
				>
					{t.label}
				</button>
			))}
		</div>
	);

	const actions = (
		<Button
			variant="ghost"
			size="icon"
			className="size-7 shrink-0 text-zinc-400"
			onClick={() => setCollapsed(!collapsed)}
			aria-label={collapsed ? "Expand bottom panel" : "Collapse bottom panel"}
			aria-expanded={!collapsed}
		>
			{collapsed ? (
				<ChevronUp className="size-4" aria-hidden />
			) : (
				<ChevronDown className="size-4" aria-hidden />
			)}
		</Button>
	);

	return (
		<section
			aria-label={active.label}
			className="flex shrink-0 flex-col border-t border-zinc-800 bg-zinc-950"
			style={collapsed ? undefined : { height: DOCK_HEIGHT }}
		>
			{active.render({ tabs: tabList, actions, collapsed })}
		</section>
	);
}
