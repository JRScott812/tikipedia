import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pkg from "./package.json" with { type: "json" };

/** Copy index.html → 404.html so GitHub Pages SPA deep links work. */
function spaFallback404() {
	return {
		name: "spa-fallback-404",
		closeBundle() {
			const index = resolve("dist/index.html");
			const fallback = resolve("dist/404.html");
			if (existsSync(index)) copyFileSync(index, fallback);
		}
	};
}

export default defineConfig(({ command }) => {
	// Local `vite` (dev) defaults to `/`. Builds and `vite preview` use `/xikipedia/`
	// so preview matches the GitHub Pages artifact (override with VITE_BASE).
	const isPreview = process.argv.includes("preview");
	const base =
		process.env.VITE_BASE || (command === "build" || isPreview ? "/xikipedia/" : "/");

	return {
		base,
		define: {
			__APP_VERSION__: JSON.stringify(pkg.version)
		},
		plugins: [
			react(),
			VitePWA({
				registerType: "prompt",
				includeAssets: [
					"favicon.svg",
					"og-image.png",
					"icons/*.svg",
					"data/*.json",
					"robots.txt",
					"sitemap.xml"
				],
				manifest: {
					name: "Tikipedia — Wikipedia Shorts",
					short_name: "Tikipedia",
					description:
						"Swipe through Wikipedia as narrated short-form videos with captions — live from Wikimedia, in multiple languages.",
					theme_color: "#000000",
					background_color: "#000000",
					display: "standalone",
					orientation: "portrait",
					start_url: "./",
					scope: "./",
					lang: "en",
					categories: ["education", "news", "entertainment"],
					icons: [
						{
							src: "favicon.svg",
							sizes: "any",
							type: "image/svg+xml",
							purpose: "any"
						},
						{
							src: "favicon.svg",
							sizes: "any",
							type: "image/svg+xml",
							purpose: "maskable"
						}
					]
				},
				workbox: {
					navigateFallback: "index.html",
					navigateFallbackDenylist: [/^\/api/],
					globPatterns: ["**/*.{js,css,html,svg,json,ico,png,woff2}"]
				},
				devOptions: {
					enabled: false
				}
			}),
			spaFallback404()
		],
		test: {
			environment: "jsdom",
			setupFiles: "./src/test/setup.ts",
			globals: true,
			css: true,
			exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"]
		}
	};
});
