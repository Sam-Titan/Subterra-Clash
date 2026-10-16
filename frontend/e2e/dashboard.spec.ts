import { expect, test } from "./helpers";

test("dashboard shows 5/0/0 vs 2/1/3 and the T6 row", async ({ page }) => {
	await page.goto("/dashboard");
	const row = (label: string) =>
		page.getByRole("row", { name: new RegExp(`^${label}\\b`) });

	await expect(row("Found")).toContainText("5");
	await expect(row("Found")).toContainText("2");
	await expect(row("False alarms").first()).toHaveText(/False alarms\s*0\s*1/);
	await expect(row("Misses").first()).toHaveText(/Misses\s*0\s*3/);
	await expect(row("Found").first()).toHaveText(/Found\s*5\s*2/);

	const t6 = page.getByRole("row", { name: /^T6\b/ });
	await expect(t6).toContainText(/CLEARANCE/i);
	await expect(t6).toContainText(/NEEDS.?DATA/i);
});
