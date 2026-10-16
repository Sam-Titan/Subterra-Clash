import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

// SwiftShader gives headless Chromium a software WebGL context.
const GL_ARGS = [
	"--use-gl=angle",
	"--use-angle=swiftshader",
	"--enable-unsafe-swiftshader",
];

export default defineConfig({
	testDir: "e2e",
	// The screenshot pass runs only through `pnpm e2e:shots` (playwright.shots.config.ts).
	testIgnore: "**/screenshots.spec.ts",
	// One in-memory backend store is shared by every spec: parallel runs would
	// read each other's mid-commit and mid-reset state.
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [["list"], ["html", { open: "never" }]],
	globalSetup: "./e2e/global-setup.ts",
	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "laptop",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1366, height: 768 },
				launchOptions: { args: GL_ARGS },
			},
		},
		{
			name: "desktop",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1920, height: 1080 },
				launchOptions: { args: GL_ARGS },
			},
		},
	],
	webServer: [
		{
			command: "uv run uvicorn app.main:app --port 8000",
			cwd: "../backend",
			url: "http://localhost:8000/api/health",
			reuseExistingServer: true,
			timeout: 60_000,
		},
		{
			command: "pnpm dev",
			env: { VITE_USE_MOCKS: "false" },
			url: BASE_URL,
			reuseExistingServer: true,
			timeout: 60_000,
		},
	],
});
