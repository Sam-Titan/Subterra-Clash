import { expect, test } from "./helpers";

test("backend down shows an error and Retry recovers", async ({ page }) => {
	// Match the backend only: "**/api/**" would also hit Vite's /src/api/*.ts modules.
	const isBackend = (url: URL) => url.pathname.startsWith("/api/");
	await page.route(isBackend, (route) => route.abort());
	await page.goto("/queue");
	const alert = page.getByRole("alert").first();
	await expect(alert).toBeVisible({ timeout: 30_000 });
	// The error block's own button, not the smaller "groups" retry link above it.
	const retry = alert.getByRole("button", { name: "Retry" });
	await expect(retry).toBeVisible();

	await page.unroute(isBackend);
	await retry.click();
	await expect(
		page.getByRole("heading", { name: "Review queue" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Escalate CLH-0002" }),
	).toBeVisible({
		timeout: 30_000,
	});
});
