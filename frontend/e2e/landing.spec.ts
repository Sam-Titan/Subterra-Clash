import { expect, test } from "./helpers";

test("landing counters show 13 / 6 / 1 and Enter Sector 7 opens the workspace", async ({
	page,
}) => {
	await page.goto("/");
	const counter = (label: string) =>
		page
			.locator("dt", { hasText: label })
			.locator("xpath=following-sibling::dd");
	// NumberTicker renders the animated number (aria-hidden) and the exact
	// value (sr-only): wait for the animation to land, then compare both.
	for (const [label, value] of [
		["Unresolved clashes", "13"],
		["Critical", "6"],
		["Dig-once opportunities", "1"],
	]) {
		await expect(counter(label).locator("[aria-hidden]")).toHaveText(value);
		await expect(counter(label).locator(".sr-only")).toHaveText(value);
	}

	await page.getByRole("link", { name: "Enter Sector 7" }).click();
	await expect(page).toHaveURL(/\/workspace$/);
});
