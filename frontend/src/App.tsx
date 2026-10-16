import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { AppShell } from "@/components/AppShell";
import { LoadingBlock } from "@/components/QueryState";
import Intake from "@/pages/Intake";
import Landing from "@/pages/Landing";
import NotFound from "@/pages/NotFound";
import Queue from "@/pages/Queue";
import Workspace from "@/pages/Workspace";

// Recharts is only needed on the dashboard; keep it out of the main bundle.
const Dashboard = lazy(() => import("@/pages/Dashboard"));

export default function App() {
	return (
		<Routes>
			<Route element={<AppShell />}>
				<Route index element={<Landing />} />
				<Route path="workspace" element={<Workspace />} />
				<Route path="queue" element={<Queue />} />
				<Route path="intake" element={<Intake />} />
				<Route
					path="dashboard"
					element={
						<Suspense
							fallback={
								<div className="p-6">
									<LoadingBlock label="Loading dashboard…" />
								</div>
							}
						>
							<Dashboard />
						</Suspense>
					}
				/>
				<Route path="*" element={<NotFound />} />
			</Route>
		</Routes>
	);
}
