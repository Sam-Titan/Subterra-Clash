import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const DURATION_S = 0.9;

/**
 * Counts up to `value`. It animates on mount and when the value changes, not
 * when a refetch returns the same number, always lands on the exact integer,
 * and jumps straight there when the user prefers reduced motion.
 */
export function NumberTicker({
	value,
	className,
}: {
	value: number;
	className?: string;
}) {
	const reduceMotion = useReducedMotion();
	const [shown, setShown] = useState(reduceMotion ? value : 0);
	const from = useRef(reduceMotion ? value : 0);

	useEffect(() => {
		if (reduceMotion || from.current === value) {
			from.current = value;
			setShown(value);
			return;
		}
		const controls = animate(from.current, value, {
			duration: DURATION_S,
			ease: "easeOut",
			onUpdate: (v) => {
				from.current = v;
				setShown(Math.round(v));
			},
			onComplete: () => {
				from.current = value;
				setShown(value);
			},
		});
		return () => controls.stop();
	}, [value, reduceMotion]);

	return (
		<span className={className}>
			<span aria-hidden>{shown}</span>
			<span className="sr-only">{value}</span>
		</span>
	);
}
