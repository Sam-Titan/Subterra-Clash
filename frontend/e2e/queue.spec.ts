import { API, expect, test } from "./helpers";

test("escalate with a note shows a toast", async ({ page }) => {
	await page.goto("/queue");
	await page.getByRole("button", { name: "Escalate CLH-0002" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Escalate CLH-0002")).toBeVisible();
	// The API rejects a review without a reviewer (422 REVIEWER_REQUIRED).
	await dialog.getByLabel("Reviewer").fill("E2E Reviewer");
	await dialog.getByLabel(/Note/).fill("Gas main - request standby");
	await dialog
		.getByRole("button", { name: /^Escalate/ })
		.last()
		.click();
	await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
	await expect(page.locator("[data-sonner-toast]").first()).toContainText(
		"CLH-0002",
	);
});

test("inspection report is served as HTML with the disclaimer", async ({
	request,
}) => {
	const res = await request.get(`${API}/api/report?format=html`);
	expect(res.status()).toBe(200);
	const body = await res.text();
	expect(body).toContain(
		"No permit has been approved or rejected by this tool",
	);
});

test("Export inspection report opens the report", async ({ page, context }) => {
	await page.goto("/queue");
	const popup = context.waitForEvent("page");
	await page.getByRole("button", { name: "Export inspection report" }).click();
	const report = await popup;
	await report.waitForLoadState();
	await expect(report.locator("body")).toContainText("Review log");
});
