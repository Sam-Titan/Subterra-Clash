import { PAGES, test, waitForPage } from "./helpers";

// Full-page screenshots for the UI audit: e2e/screenshots/<project>/<page>.png
// (gitignored). Run with `pnpm e2e:shots`.
for (const { name, path } of PAGES) {
	test(`screenshot ${name}`, async ({ page }, info) => {
		test.slow();
		await waitForPage(page, path);
		await page.screenshot({
			path: `e2e/screenshots/${info.project.name}/${name}.png`,
			fullPage: true,
		});
	});
}
