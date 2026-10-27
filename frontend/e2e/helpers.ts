import {
	test as base,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";

export const API = "http://localhost:8000";

/** Back to the seed. Call from beforeEach in every spec that changes state. */
export async function resetStore() {
	const res = await fetch(`${API}/api/reset`, { method: "POST" });
	if (!res.ok) throw new Error(`POST /api/reset failed: ${res.status}`);
}

/**
 * `test` with an automatic fixture: the store is reset to the seed before and
 * after every test, so specs never see each other's commits or reviews.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: Playwright fixture with no value
export const test = base.extend<{ seedStore: void }>({
	seedStore: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright requires the destructuring pattern
		async ({}, use) => {
			await resetStore();
			await use();
			await resetStore();
		},
		{ auto: true },
	],
});

export { expect };

/** Pages checked by the quality and screenshot specs. */
export const PAGES = [
	{ name: "landing", path: "/" },
	{ name: "workspace", path: "/workspace" },
	{ name: "queue", path: "/queue" },
	{ name: "intake", path: "/intake" },
	{ name: "dashboard", path: "/dashboard" },
] as const;

/** Waits until the page has its data and the 3D canvas (workspace) is drawn. */
export async function waitForPage(page: Page, path: string) {
	await page.goto(path);
	await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
	if (path === "/workspace") {
		await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });
		// Let the camera settle and the first frames render.
		await page.waitForTimeout(1500);
	}
	// NumberTicker counts up over ~0.9 s; shooting earlier freezes it mid-count.
	if (path === "/" || path === "/dashboard") await page.waitForTimeout(1500);
}

/**
 * Pairs of <text> elements inside `svg` whose boxes overlap, as "a | b".
 * `only` limits the first element of each pair to texts matching it.
 */
export async function overlappingTexts(
	svg: Locator,
	only?: string,
): Promise<string[]> {
	return svg.evaluate((el, match) => {
		const texts = [...el.querySelectorAll("text")].map((t) => ({
			s: (t.textContent ?? "").replace(/\s+/g, " ").trim(),
			r: t.getBoundingClientRect(),
		}));
		const hit = (a: DOMRect, b: DOMRect) =>
			a.left < b.right - 0.5 &&
			a.right > b.left + 0.5 &&
			a.top < b.bottom - 0.5 &&
			a.bottom > b.top + 0.5;
		const out: string[] = [];
		for (const [i, a] of texts.entries()) {
			if (a.r.width === 0 || (match && !a.s.includes(match))) continue;
			for (const [j, b] of texts.entries()) {
				if (i === j || b.r.width === 0) continue;
				if (!match && j < i) continue;
				if (hit(a.r, b.r)) out.push(`${a.s} | ${b.s}`);
			}
		}
		return out;
	}, only);
}
