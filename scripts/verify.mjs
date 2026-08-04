/**
 * Runs the same gate GitHub Actions runs.
 *
 * `playwright.config.ts` and `lighthouserc.cjs` branch on `process.env.CI`, so a bare
 * local run exercises different settings than the workflow (reused dev servers, no
 * `forbidOnly`, parallel workers, fewer Lighthouse samples). Forcing CI on here keeps
 * "passes locally" and "passes on GitHub" the same statement.
 */
import { spawnSync } from "node:child_process";

const steps = [
	"format:check",
	"lint",
	"typecheck",
	"test",
	"build",
	"test:e2e",
	"test:lighthouse"
];

const env = { ...process.env, CI: process.env.CI || "1" };

for (const step of steps) {
	const { status, error } = spawnSync("npm", ["run", step], {
		stdio: "inherit",
		shell: true,
		env
	});

	if (error) {
		console.error(`\nFailed to start "npm run ${step}": ${error.message}`);
		process.exit(1);
	}

	if (status !== 0) {
		console.error(`\nVerify failed at "npm run ${step}".`);
		process.exit(status ?? 1);
	}
}
