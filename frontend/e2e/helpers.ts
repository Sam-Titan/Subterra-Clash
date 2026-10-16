import { test as base, expect, type Page } from "@playwright/test";

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
	if (path === "/") await page.waitForTimeout(1200); // counters tick up
}
