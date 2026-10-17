import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

test.beforeEach(() => {
	test.slow(); // SwiftShader renders the scene in software
});

/** A canvas with a drawn scene has many distinct colours; a blank one has one. */
async function canvasVariance(page: Page) {
	const png = await page.locator("canvas").first().screenshot();
	return page.evaluate(async (b64) => {
		const img = new Image();
		img.src = `data:image/png;base64,${b64}`;
		await img.decode();
		const c = document.createElement("canvas");
		c.width = img.width;
		c.height = img.height;
		const ctx = c.getContext("2d");
		if (!ctx) return 0;
		ctx.drawImage(img, 0, 0);
		const { data } = ctx.getImageData(0, 0, c.width, c.height);
		const colours = new Set<number>();
		for (let i = 0; i < data.length; i += 16) {
			colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
		}
		return colours.size;
	}, png.toString("base64"));
}

/**
 * Share of pixels in the middle of the 3D canvas that are not the single most
 * common colour (background/fog), with every HTML overlay (street labels)
 * hidden so only what WebGL drew counts. Measured: a drawn view is 0.5 to 0.7,
 * the blank scene after the fly-to bug was 0.03 to 0.06.
 */
async function centreDrawnShare(page: Page) {
	await page.addStyleTag({ content: "canvas ~ * { visibility: hidden }" });
	const box = await page.locator("canvas").first().boundingBox();
	if (!box) return 0;
	const png = await page.screenshot({
		clip: {
			x: box.x + box.width * 0.3,
			y: box.y + box.height * 0.3,
			width: box.width * 0.4,
			height: box.height * 0.3,
		},
	});
	return page.evaluate(async (b64) => {
		const img = new Image();
		img.src = `data:image/png;base64,${b64}`;
		await img.decode();
		const c = document.createElement("canvas");
		c.width = img.width;
		c.height = img.height;
		const ctx = c.getContext("2d");
		if (!ctx) return 0;
		ctx.drawImage(img, 0, 0);
		const { data } = ctx.getImageData(0, 0, c.width, c.height);
		const counts = new Map<number, number>();
		for (let i = 0; i < data.length; i += 4) {
			const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
			counts.set(k, (counts.get(k) ?? 0) + 1);
		}
		return 1 - Math.max(...counts.values()) / (data.length / 4);
	}, png.toString("base64"));
}

/** Well above the blank scene (0.06), well below any drawn view (0.5+). */
const DRAWN = 0.25;

test("workspace loads the scene and the canvas is not blank", async ({
	page,
}) => {
	await page.goto("/workspace");
	await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole("heading", { name: "Conflicts" })).toBeVisible();
	await expect(page.getByText("13 of 13")).toBeVisible();
	await page.waitForTimeout(2000);
	expect(await canvasVariance(page)).toBeGreaterThan(20);
});

test("street level, X-ray and overview toggle", async ({ page }) => {
	await page.goto("/workspace");
	await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });
	const street = page.getByRole("button", { name: "Street level" });
	const overview = page.getByRole("button", { name: "Overview" });
	const xray = page.getByRole("button", { name: "X-ray", exact: true });

	await street.click();
	await expect(street).toHaveAttribute("aria-pressed", "true");
	await expect(xray).toHaveAttribute("aria-pressed", "false"); // street forces X-ray off

	await xray.click();
	await expect(xray).toHaveAttribute("aria-pressed", "true");

	await overview.click();
	await expect(overview).toHaveAttribute("aria-pressed", "true");
	await expect(street).toHaveAttribute("aria-pressed", "false");
	await page.waitForTimeout(1500);
	expect(await canvasVariance(page)).toBeGreaterThan(20);
});

test("selecting T1 from the conflict list shows -0.60 / 1.00 / Likely", async ({
	page,
}) => {
	await page.goto("/workspace");
	await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });
	await page.getByRole("button", { name: /CLH-0002/ }).click();

	const panel = page.locator("aside");
	await expect(panel.getByText("−0.60 m (overlap)")).toBeVisible();
	await expect(
		panel.getByText("1.00 m", { exact: true }).first(),
	).toBeVisible();
	await expect(
		panel.getByText("Likely", { exact: true }).first(),
	).toBeVisible();
});

for (const id of ["CLH-0002", "CLH-0004"]) {
	test(`selecting ${id} keeps the 3D scene drawn, section on and off`, async ({
		page,
	}) => {
		await page.goto("/workspace");
		await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });
		await page.waitForTimeout(2000);
		await page.getByRole("button", { name: new RegExp(id) }).click();

		// Selecting a clash flies the camera to it and switches the section on.
		await expect(
			page.getByRole("tab", { name: "Cross-section" }),
		).toBeVisible();
		await expect
			.poll(() => centreDrawnShare(page), { timeout: 20_000 })
			.toBeGreaterThan(DRAWN);

		const section = page.getByRole("button", { name: "Section", exact: true });
		await expect(section).toHaveAttribute("aria-pressed", "true");
		await section.click();
		await expect(section).toHaveAttribute("aria-pressed", "false");
		await page.waitForTimeout(1500);
		expect(await centreDrawnShare(page)).toBeGreaterThan(DRAWN);
	});
}
