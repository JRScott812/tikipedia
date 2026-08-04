/**
 * Lighthouse CI — runs against the production preview (`dist/`).
 * Prefer static app-shell routes; the live Wikipedia feed makes LCP flaky.
 *
 * Uses Playwright's Chromium so local machines without Google Chrome still work
 * (CI already installs Chromium via `npx playwright install`).
 */
const { chromium } = require("playwright");
const site = require("./site.config.json");

const previewURL = `http://${site.previewHost}:${site.previewPort}${site.base}`;

module.exports = {
	ci: {
		collect: {
			chromePath: chromium.executablePath(),
			startServerCommand: "npm run preview",
			startServerReadyPattern: "Local:",
			url: [previewURL, `${previewURL}about`, `${previewURL}settings`],
			numberOfRuns: process.env.CI ? 2 : 1,
			settings: {
				preset: "desktop",
				// Playwright Chromium + CI often need these for headless paint
				chromeFlags: "--no-sandbox --disable-dev-shm-usage",
				skipAudits: [
					// Local preview / project-subdir hosting — not meaningful on 127.0.0.1
					"uses-http2",
					"redirects-http",
					"robots-txt",
					// Canonical + OG point at production GitHub Pages URLs
					"canonical",
					// Live Wikimedia / Commons noise when the feed hydrates
					"third-party-cookies",
					"inspector-issues"
				]
			}
		},
		assert: {
			assertions: {
				"categories:performance": ["warn", { minScore: 0.5 }],
				"categories:accessibility": ["error", { minScore: 0.9 }],
				"categories:best-practices": ["warn", { minScore: 0.8 }],
				"categories:seo": ["error", { minScore: 0.9 }],
				// Noisy for SPAs / local preview / removed LH audits
				"bf-cache": "off",
				"unused-javascript": "off",
				"unused-css-rules": "warn",
				"total-byte-weight": "warn",
				"uses-long-cache-ttl": "off",
				"csp-xss": "off",
				"errors-in-console": "warn"
			}
		},
		upload: {
			target: "filesystem",
			outputDir: ".lighthouseci"
		}
	}
};
