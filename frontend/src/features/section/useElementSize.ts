import { type RefObject, useEffect, useState } from "react";

/** Content-box size of an element, kept current with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
	const [size, setSize] = useState({ width: 0, height: 0 });
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			setSize((s) =>
				s.width === width && s.height === height ? s : { width, height },
			);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);
	return size;
}
