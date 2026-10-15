import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

// Placeholder; the hero moment and live counters come in 3E.
export default function Landing() {
	return (
		<section className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
			<h1 className="text-4xl font-bold tracking-tight">Subterra Clash</h1>
			<p className="max-w-2xl text-zinc-400">
				See what is under the road before anyone digs — in 3D. Every probable
				clash between planned works and existing utilities, with the evidence,
				the uncertainty, and a review queue.
			</p>
			<Button asChild size="lg">
				<Link to="/workspace">
					Enter Sector 7
					<ArrowRight className="size-4" aria-hidden />
				</Link>
			</Button>
		</section>
	);
}
