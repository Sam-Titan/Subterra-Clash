import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { CHART_COLORS } from "@/lib/colors";

export interface BreakdownRow {
	key: string;
	label: string;
	count: number;
	/** Entity colour from colors.ts (utility or certainty). */
	color: string;
}

const BAR_PX = 26;
const CHART_PAD_PX = 16;

/**
 * One series of horizontal bars, each bar in its entity's colour, with the
 * count printed at the bar end and a hover tooltip. Rows keep the API's order.
 */
export function BreakdownChart({
	rows,
	ariaLabel,
}: {
	rows: BreakdownRow[];
	ariaLabel: string;
}) {
	if (rows.length === 0)
		return (
			<p className="flex h-32 items-center justify-center rounded-md border border-dashed border-zinc-800 text-sm text-zinc-400">
				No unresolved clashes
			</p>
		);

	const config: ChartConfig = Object.fromEntries(
		rows.map((r) => [r.key, { label: r.label, color: r.color }]),
	);

	return (
		<ChartContainer
			config={config}
			className="aspect-auto w-full"
			style={{ height: rows.length * BAR_PX + CHART_PAD_PX }}
			role="img"
			aria-label={`${ariaLabel}: ${rows.map((r) => `${r.label} ${r.count}`).join(", ")}`}
		>
			<BarChart
				data={rows}
				layout="vertical"
				margin={{ top: 4, right: 36, bottom: 4, left: 4 }}
				barCategoryGap={4}
			>
				<XAxis
					type="number"
					hide
					allowDecimals={false}
					domain={[0, "dataMax"]}
				/>
				<YAxis
					type="category"
					dataKey="label"
					width={86}
					tickLine={false}
					axisLine={false}
					tick={{ fill: CHART_COLORS.axisLabel, fontSize: 12 }}
				/>
				<ChartTooltip
					cursor={{ fill: CHART_COLORS.cursor }}
					content={<ChartTooltipContent nameKey="key" hideLabel />}
				/>
				<Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
					{rows.map((r) => (
						<Cell key={r.key} fill={r.color} />
					))}
					<LabelList
						dataKey="count"
						position="right"
						offset={8}
						fill={CHART_COLORS.valueLabel}
						fontSize={12}
						className="tabular-nums"
					/>
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}
