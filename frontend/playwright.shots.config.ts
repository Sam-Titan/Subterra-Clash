import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** `pnpm e2e:shots`: only the screenshot pass, same projects and servers. */
export default defineConfig({
	...base,
	testIgnore: undefined,
	testMatch: "**/screenshots.spec.ts",
	reporter: [["list"]],
});
