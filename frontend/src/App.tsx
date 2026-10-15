import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function App() {
	const [count, setCount] = useState(0);

	return (
		<main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
			<Card className="max-w-lg w-full border-zinc-800 bg-zinc-900/90 text-zinc-100 shadow-2xl backdrop-blur">
				<CardHeader className="space-y-2">
					<div className="flex items-center justify-between">
						<span className="text-xs uppercase tracking-widest text-emerald-400 font-mono">
							Phase 0 · Setup
						</span>
						<Badge
							variant="outline"
							className="border-emerald-500/50 text-emerald-400 bg-emerald-950/40"
						>
							Session 0F Ready
						</Badge>
					</div>
					<CardTitle className="text-2xl font-bold tracking-tight text-zinc-50">
						Subterra Clash
					</CardTitle>
					<CardDescription className="text-zinc-400">
						Underground 3D clash engine & spatial-temporal utility coordination.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-xs font-mono space-y-1 text-zinc-300">
						<p className="text-zinc-400 font-semibold">[Stack Verification]</p>
						<p>✓ React 19 + TypeScript (Strict)</p>
						<p>✓ Tailwind CSS v4 + shadcn/ui</p>
						<p>✓ Three.js + React Three Fiber + Drei</p>
						<p>✓ TanStack Query + TanStack Table + Zustand</p>
						<p>✓ Biome linter/formatter configured</p>
					</div>

					<div className="flex items-center justify-between pt-2">
						<Button
							variant="default"
							className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
							onClick={() => setCount((c) => c + 1)}
						>
							Interactive Test Counter: {count}
						</Button>
						<span className="text-xs text-zinc-500 font-mono">
							Vite Proxy: /api → 8000
						</span>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
