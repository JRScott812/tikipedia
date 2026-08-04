import { defineConfig, devices } from "@playwright/test";
import site from "./site.config.json" with { type: "json" };

const previewURL = `http://${site.previewHost}:${site.previewPort}${site.base}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || previewURL;

export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL,
		trace: "on-first-retry"
	},
	webServer: {
		command: "npm run build && npm run preview",
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] }
		}
	]
});
