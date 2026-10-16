import { expect, test } from "./helpers";

test("sample 2 -> Add to coordination plan -> toast and 3 new clashes", async ({
	page,
}) => {
	test.slow();
	await page.goto("/intake");
	await page.getByRole("button", { name: /Jal Board water line/ }).click();
	await expect(page.getByText("Extracting fields…")).toHaveCount(0, {
		timeout: 30_000,
	});

	await page.getByLabel("Reviewer").fill("E2E Reviewer");
	await page.getByRole("button", { name: "Add to coordination plan" }).click();

	await expect(
		page.getByText(/added to coordination plan/).first(),
	).toBeVisible();
	await expect(page).toHaveURL(/\/workspace$/);
	await expect(page.getByText("16 of 16")).toBeVisible({ timeout: 30_000 });
	// The conflict list tags the new clashes (CLH-0014..0016); the banner has its own copy.
	await expect(
		page.locator("aside").getByText("New", { exact: true }),
	).toHaveCount(3);
});
