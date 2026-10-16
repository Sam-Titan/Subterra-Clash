import { Layers } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { USE_MOCKS } from "@/api/client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

// SPEC §11, verbatim.
export const DISCLAIMER =
	"Decision-support output from synthetic data. Clearance values are illustrative. No permit has been approved or rejected by this tool; all findings require engineering review and field verification.";

const NAV = [
	{ to: "/workspace", label: "Workspace" },
	{ to: "/queue", label: "Review queue" },
	{ to: "/intake", label: "Permit intake" },
	{ to: "/dashboard", label: "Dashboard" },
] as const;

export function AppShell() {
	const { pathname } = useLocation();
	return (
		<MotionConfig reducedMotion="user">
			<div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
				<header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
					<div className="flex h-14 items-center gap-6 px-4">
						<Link
							to="/"
							className="flex items-center gap-2 font-semibold tracking-tight"
						>
							<Layers className="size-5 text-zinc-300" aria-hidden />
							Subterra Clash
							<span className="hidden text-xs font-normal text-zinc-500 sm:inline">
								Navgarh — Sector 7
							</span>
						</Link>
						<nav className="flex items-center gap-1 text-sm">
							{NAV.map((item) => (
								<NavLink
									key={item.to}
									to={item.to}
									className={({ isActive }) =>
										cn(
											"rounded-md px-3 py-1.5 transition-colors",
											isActive
												? "bg-zinc-800 text-zinc-50"
												: "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
										)
									}
								>
									{item.label}
								</NavLink>
							))}
						</nav>
						{USE_MOCKS && (
							<Badge
								variant="outline"
								className="ml-auto border-zinc-700 font-mono text-zinc-400"
							>
								Mock data
							</Badge>
						)}
					</div>
				</header>
				<main className="flex flex-1 flex-col">
					{/* Enter-only transition: no exit animation, so the 3D canvas is
				    never mounted twice while pages cross-fade. */}
					<motion.div
						key={pathname}
						className="flex flex-1 flex-col"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
					>
						<ErrorBoundary resetKey={pathname}>
							<Outlet />
						</ErrorBoundary>
					</motion.div>
				</main>
				<footer className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">
					{DISCLAIMER}
				</footer>
				<Toaster theme="dark" position="bottom-right" closeButton />
			</div>
		</MotionConfig>
	);
}
