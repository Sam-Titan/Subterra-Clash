import type { Page } from "@playwright/test";
import { PAGES, test, waitForPage } from "./helpers";

// Screenshots for the UI audit, two per page:
//   <label>/<project>/<page>.viewport.png  what is above the fold
//   <label>/<project>/<page>.full.png      all content, height constraints lifted
// Folders are gitignored. `pnpm e2e:shots` writes "after"; set SHOT_LABEL=baseline
// to take the "before" set on an older commit.
const LABEL = process.env.SHOT_LABEL ?? "after";

// The shell and some panels scroll inside a fixed-height box; mark such boxes
// data-scroll / data-shot-expand and this opens them for the full-content shot.
const LIFT_HEIGHT = `
	html, body, #root { height: auto !important; min-height: 0 !important; overflow: visible !important; }
	[data-scroll], [data-shot-expand] {
		position: static !important; inset: auto !important;
		height: auto !important; max-height: none !important; overflow: visible !important;
	}
`;

const SHOTS: {
	name: string;
	path: string;
	prepare?: (page: Page) => Promise<void>;
}[] = [
	...PAGES.map((p) => ({ name: p.name, path: p.path })),
	{
		name: "workspace-clash",
		path: "/workspace",
		prepare: async (page) => {
			await page.getByRole("button", { name: /CLH-0002/ }).click();
			await page.getByText("−0.60 m (overlap)").first().waitFor();
			await page.waitForTimeout(1500); // fly-to and section plane settle
		},
	},
	{
		name: "intake-parsed",
		path: "/intake",
		prepare: async (page) => {
			await page.getByRole("button", { name: /Jal Board water line/ }).click();
			await page
				.getByText("Extracting fields…")
				.waitFor({ state: "detached", timeout: 30_000 });
			await page.waitForTimeout(500);
		},
	},
];

for (const { name, path, prepare } of SHOTS) {
	test(`screenshot ${name}`, async ({ page }, info) => {
		test.slow();
		await waitForPage(page, path);
		await prepare?.(page);
		const dir = `e2e/screenshots/${LABEL}/${info.project.name}`;
		await page.screenshot({ path: `${dir}/${name}.viewport.png` });
		await page.addStyleTag({ content: LIFT_HEIGHT });
		await page.waitForTimeout(300);
		await page.screenshot({ path: `${dir}/${name}.full.png`, fullPage: true });
	});
}
