import { Route, Routes } from "react-router";
import { AppShell } from "@/components/AppShell";
import Dashboard from "@/pages/Dashboard";
import Intake from "@/pages/Intake";
import Landing from "@/pages/Landing";
import NotFound from "@/pages/NotFound";
import Queue from "@/pages/Queue";
import Workspace from "@/pages/Workspace";

export default function App() {
	return (
		<Routes>
			<Route element={<AppShell />}>
				<Route index element={<Landing />} />
				<Route path="workspace" element={<Workspace />} />
				<Route path="queue" element={<Queue />} />
				<Route path="intake" element={<Intake />} />
				<Route path="dashboard" element={<Dashboard />} />
				<Route path="*" element={<NotFound />} />
			</Route>
		</Routes>
	);
}
