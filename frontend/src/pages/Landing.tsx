import { ArrowRight } from "lucide-react";
import {
	type CSSProperties,
	type PointerEvent,
	type Ref,
	useLayoutEffect,
	useRef,
} from "react";
import { Link } from "react-router";
import { useSummary } from "@/api/hooks";
import { NumberTicker } from "@/components/NumberTicker";
import { describeError, SkeletonTiles } from "@/components/QueryState";
import { Button } from "@/components/ui/button";
import {
	CERTAINTY_COLORS,
	LANDING_COLORS,
	UTILITY_COLORS,
	WORK_COLOR,
} from "@/lib/colors";

/** Spotlight radius (px). Until the pointer moves it rests on the clash. */
const SPOT_RADIUS = 190;
const SPOT_REST = { x: "70%", y: "45%" };

// Hero drawing in a 1200 × 600 viewBox, scaled to cover. Pipe depths are
// illustrative; the colours are the APWA codes used everywhere else.
const PIPES: { d: string; color: string; width: number; halo?: number }[] = [
	{ d: "M -20 250 L 1220 250", color: UTILITY_COLORS.GAS, width: 7, halo: 26 },
	{ d: "M -20 300 L 1220 312", color: UTILITY_COLORS.WATER, width: 11 },
	{
		d: "M -20 360 L 520 360 L 640 340 L 1220 340",
		color: UTILITY_COLORS.TELECOM,
		width: 5,
		halo: 44,
	},
	{ d: "M -20 430 L 1220 422", color: UTILITY_COLORS.SEWER, width: 15 },
	{ d: "M 300 160 L 300 640", color: UTILITY_COLORS.POWER, width: 5 },
	{ d: "M 1110 160 L 1110 640", color: UTILITY_COLORS.WATER, width: 8 },
];

/** The clash the spotlight rests on: a pink trench cutting the gas main. */
const TRENCH = { x: 920, y: 170, w: 70, h: 120 };
const MARKER = { x: 955, y: 250 };

function Underground({ markerRef }: { markerRef: Ref<SVGCircleElement> }) {
	return (
		<svg
			aria-hidden
			className="absolute inset-0 size-full"
			viewBox="0 0 1200 600"
			preserveAspectRatio="xMidYMid slice"
		>
			<defs>
				<linearGradient id="landing-soil" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor={LANDING_COLORS.soilTop} />
					<stop offset="1" stopColor={LANDING_COLORS.soilBottom} />
				</linearGradient>
			</defs>
			<rect width="1200" height="600" fill="url(#landing-soil)" />
			{[200, 280, 360, 440, 520].map((y) => (
				<line
					key={y}
					x1="0"
					x2="1200"
					y1={y}
					y2={y}
					stroke={LANDING_COLORS.soilLine}
					strokeDasharray="2 10"
				/>
			))}
			{PIPES.map((p) =>
				p.halo ? (
					<path
						key={`${p.d}-halo`}
						d={p.d}
						stroke={p.color}
						strokeOpacity={0.12}
						strokeWidth={p.halo}
						strokeLinecap="round"
						fill="none"
					/>
				) : null,
			)}
			{PIPES.map((p) => (
				<path
					key={p.d}
					d={p.d}
					stroke={p.color}
					strokeWidth={p.width}
					strokeLinecap="round"
					fill="none"
				/>
			))}
			<rect
				x={TRENCH.x}
				y={TRENCH.y}
				width={TRENCH.w}
				height={TRENCH.h}
				fill={WORK_COLOR}
				fillOpacity={0.25}
				stroke={WORK_COLOR}
				strokeWidth={2}
			/>
			<circle
				ref={markerRef}
				cx={MARKER.x}
				cy={MARKER.y}
				r={9}
				fill={CERTAINTY_COLORS.LIKELY}
			/>
			<circle
				cx={MARKER.x}
				cy={MARKER.y}
				r={9}
				fill="none"
				stroke={CERTAINTY_COLORS.LIKELY}
				strokeWidth={2}
				className="origin-center [transform-box:fill-box] motion-safe:animate-ping"
			/>
		</svg>
	);
}

function Surface() {
	return (
		<svg
			aria-hidden
			className="absolute inset-0 size-full"
			viewBox="0 0 1200 600"
			preserveAspectRatio="xMidYMid slice"
		>
			<rect width="1200" height="600" fill={LANDING_COLORS.surface} />
			<rect y="120" width="1200" height="6" fill={LANDING_COLORS.kerb} />
			<rect y="474" width="1200" height="6" fill={LANDING_COLORS.kerb} />
			<line
				x1="0"
				x2="1200"
				y1="300"
				y2="300"
				stroke={LANDING_COLORS.surfaceMarking}
				strokeWidth={4}
				strokeDasharray="40 36"
			/>
		</svg>
	);
}

function LiveCounters() {
	const summary = useSummary();
	if (summary.isPending)
		return (
			<SkeletonTiles
				count={3}
				label="Loading live counts…"
				className="w-full max-w-xl grid-cols-3"
			/>
		);
	if (summary.isError)
		return (
			<p role="alert" className="text-xs text-zinc-400">
				Live counts unavailable: {describeError(summary.error).detail}{" "}
				<button
					type="button"
					onClick={() => summary.refetch()}
					className="text-zinc-300 underline underline-offset-2"
				>
					Retry
				</button>
			</p>
		);
	const { counts } = summary.data;
	const stats = [
		{ label: "Unresolved clashes", value: counts.open },
		{ label: "Critical", value: counts.critical },
		{ label: "Dig-once opportunities", value: counts.dig_once },
	];
	return (
		<dl className="flex flex-wrap justify-center gap-x-10 gap-y-3">
			{stats.map((s) => (
				<div key={s.label} className="flex flex-col items-center gap-0.5">
					<dt className="text-xs text-zinc-400">{s.label}</dt>
					<dd>
						<NumberTicker
							value={s.value}
							className="block text-2xl font-semibold tabular-nums text-zinc-100"
						/>
					</dd>
				</div>
			))}
		</dl>
	);
}

/** Moves the spotlight (CSS variables on the hero) to a viewport point. */
function spotAt(el: HTMLElement | null, clientX: number, clientY: number) {
	if (!el) return;
	const rect = el.getBoundingClientRect();
	el.style.setProperty("--spot-x", `${clientX - rect.left}px`);
	el.style.setProperty("--spot-y", `${clientY - rect.top}px`);
}

/**
 * SPEC §10.1. One hero moment: an x-ray spotlight. The road surface covers
 * the ground; a hole follows the pointer and shows the utilities beneath,
 * with a trench cutting the gas main. Pointer tracking writes CSS variables
 * directly (no re-render per move).
 */
export default function Landing() {
	const heroRef = useRef<HTMLElement>(null);
	const markerRef = useRef<SVGCircleElement>(null);
	const moved = useRef(false);

	// The drawing is scaled to cover, so find where the marker actually landed
	// and rest the spotlight there (again on resize, until the pointer moves).
	useLayoutEffect(() => {
		const rest = () => {
			const marker = markerRef.current?.getBoundingClientRect();
			if (!marker || moved.current) return;
			spotAt(
				heroRef.current,
				marker.left + marker.width / 2,
				marker.top + marker.height / 2,
			);
		};
		rest();
		window.addEventListener("resize", rest);
		return () => window.removeEventListener("resize", rest);
	}, []);

	const onPointerMove = (e: PointerEvent<HTMLElement>) => {
		moved.current = true;
		spotAt(heroRef.current, e.clientX, e.clientY);
	};

	const mask = `radial-gradient(circle ${SPOT_RADIUS}px at var(--spot-x) var(--spot-y), transparent 0, transparent 88%, black 100%)`;

	return (
		<section
			ref={heroRef}
			onPointerMove={onPointerMove}
			className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-12 text-center"
			style={
				{
					"--spot-x": SPOT_REST.x,
					"--spot-y": SPOT_REST.y,
				} as CSSProperties
			}
		>
			<Underground markerRef={markerRef} />
			<div
				className="absolute inset-0"
				style={{ maskImage: mask, WebkitMaskImage: mask }}
			>
				<Surface />
			</div>
			<div
				aria-hidden
				className="pointer-events-none absolute rounded-full"
				style={{
					left: "var(--spot-x)",
					top: "var(--spot-y)",
					width: SPOT_RADIUS * 2,
					height: SPOT_RADIUS * 2,
					transform: "translate(-50%, -50%)",
					boxShadow: `inset 0 0 0 1px ${LANDING_COLORS.spotlightRim}`,
				}}
			>
				<span className="absolute inset-x-0 bottom-6 text-center text-xs text-zinc-300">
					Move the pointer to look underground
				</span>
			</div>

			<div className="relative flex max-w-3xl flex-col items-center gap-6">
				<h1 className="text-5xl font-bold tracking-tight drop-shadow-lg sm:text-6xl">
					Subterra Clash
				</h1>
				<p className="max-w-xl text-zinc-200 [text-shadow:0_1px_12px_rgb(0_0_0/0.9)]">
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
				<LiveCounters />
			</div>
		</section>
	);
}
