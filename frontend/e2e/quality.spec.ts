import AxeBuilder from "@axe-core/playwright";
import { expect, PAGES, test, waitForPage } from "./helpers";

// The one dev-only React warning we accept (StrictMode + R3F unmount).
const ALLOWED_CONSOLE = /synchronously unmount a root/;

for (const { name, path } of PAGES) {
	test.describe(name, () => {
		test.beforeEach(() => {
			test.slow();
		});

		test("no console errors", async ({ page }) => {
			const errors: string[] = [];
			page.on("console", (m) => {
				if (m.type() === "error" && !ALLOWED_CONSOLE.test(m.text()))
					errors.push(m.text());
			});
			page.on("pageerror", (e) => {
				if (!ALLOWED_CONSOLE.test(e.message)) errors.push(e.message);
			});
			await waitForPage(page, path);
			expect(errors).toEqual([]);
		});

		if (path === "/queue" || path === "/dashboard") {
			test("last content is fully visible above the pinned footer", async ({
				page,
			}) => {
				await waitForPage(page, path);
				await page.getByRole("main").evaluate((m) => {
					m.scrollTop = m.scrollHeight;
				});
				// The page fades in with a small slide; measure once it has settled.
				await expect
					.poll(
						() =>
							page.evaluate(() => {
								const main = document.querySelector("main");
								const footer = document.querySelector("footer");
								if (!main || !footer) return Number.NaN;
								let bottom = 0;
								for (const el of main.querySelectorAll("*")) {
									const r = el.getBoundingClientRect();
									if (r.width > 0 && r.height > 0)
										bottom = Math.max(bottom, r.bottom);
								}
								return footer.getBoundingClientRect().top - bottom;
							}),
						{ message: "gap between last content and the footer (px)" },
					)
					.toBeGreaterThanOrEqual(-0.5);
			});
		}

		test("no horizontal overflow", async ({ page }) => {
			await waitForPage(page, path);
			const overflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth -
					document.documentElement.clientWidth,
			);
			expect(overflow).toBeLessThanOrEqual(0);
		});

		test("disclaimer is visible in the viewport", async ({ page }) => {
			await waitForPage(page, path);
			await expect(page.getByRole("contentinfo")).toContainText(
				"No permit has been approved or rejected by this tool",
			);
			await expect(page.getByRole("contentinfo")).toBeInViewport();
		});

		test("no serious or critical accessibility violations (except contrast)", async ({
			page,
		}) => {
			await waitForPage(page, path);
			const { violations } = await new AxeBuilder({ page })
				.disableRules(["color-contrast"])
				.analyze();
			const bad = violations.filter(
				(v) => v.impact === "serious" || v.impact === "critical",
			);
			expect(
				bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`),
			).toEqual([]);
		});

		test("no colour-contrast violations", async ({ page }) => {
			await waitForPage(page, path);
			const { violations } = await new AxeBuilder({ page })
				.withRules(["color-contrast"])
				.analyze();
			expect(
				violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
			).toEqual([]);
		});
	});
}
