import { expect, test, type Page } from "@playwright/test";

async function finishOnboarding(page: Page) {
	const start = page.locator("#startScreen");
	if (await start.isVisible().catch(() => false)) {
		await page.locator("#startBtn").click();
		await expect(start).toBeHidden({ timeout: 15_000 });
	}
}

async function seedReturningUser(page: Page) {
	await page.addInitScript(() => {
		const settings = {
			storeData: true,
			openMainWiki: false,
			wikiLang: "en",
			profile: "default",
			profiles: ["default"],
			theme: "theme-auto",
			muted: true,
			voiceURI: "",
			speechRate: 1,
			voiceAutoMatched: true,
			captionSize: 1,
			captionStroke: 2
		};
		localStorage.setItem("tikipedia-settings", JSON.stringify(settings));
		localStorage.setItem(
			"tikipedia-profile-default",
			JSON.stringify({
				profileName: "Default",
				timeSpentTotal: 1,
				byLang: {
					en: {
						categoryScores: { science: 5 },
						seenPosts: [1],
						likedPosts: [],
						dislikedPosts: []
					}
				}
			})
		);
	});
}

test.describe("Tikipedia SPA", () => {
	test("loads the app shell", async ({ page }) => {
		await page.goto("./");
		await expect(page.locator("#loading")).toBeHidden({ timeout: 30_000 });
		await finishOnboarding(page);
		await expect(page.getByRole("navigation", { name: /main/i })).toBeVisible();
		await expect(page.locator(".feedHeader")).toBeVisible();
	});

	test("navigates to settings and about", async ({ page }) => {
		await seedReturningUser(page);
		await page.goto("./");
		await expect(page.locator("#loading")).toBeHidden({ timeout: 30_000 });
		await finishOnboarding(page);

		await page.getByRole("button", { name: /settings/i }).click();
		await expect(page.getByRole("heading", { name: /^settings$/i })).toBeVisible();
		await expect(page).toHaveURL(/settings/);

		await page.getByRole("button", { name: /^about$/i }).click();
		await expect(page.getByRole("heading", { name: /^about$/i })).toBeVisible();
		await expect(page.getByText(/Version 3\.0\.0/)).toBeVisible();
	});

	test("refreshes settings deep link", async ({ page }) => {
		await seedReturningUser(page);
		await page.goto("./settings");
		await expect(page.locator("#loading")).toBeHidden({ timeout: 30_000 });
		await finishOnboarding(page);
		await expect(page.getByRole("heading", { name: /^settings$/i })).toBeVisible();
		await page.reload();
		await expect(page.getByRole("heading", { name: /^settings$/i })).toBeVisible();
	});

	test("opens a post deep link path", async ({ page }) => {
		await seedReturningUser(page);

		await page.route("**/api.php*", async (route) => {
			const url = new URL(route.request().url());
			const titles = url.searchParams.get("titles") || "";
			const pageids = url.searchParams.get("pageids") || "";
			if (url.searchParams.get("action") === "query" && (titles || pageids)) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						query: {
							pages: {
								"1": {
									pageid: 1,
									title: "Albert Einstein",
									extract:
										"Albert Einstein was a German-born theoretical physicist who developed the theory of relativity.",
									categories: [{ title: "Category:Physicists" }],
									links: [{ title: "Physics" }],
									pageimage: "Einstein.jpg"
								}
							}
						}
					})
				});
				return;
			}
			if (url.searchParams.get("list") === "random") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						query: { random: [{ id: 2, title: "Physics" }] }
					})
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ query: { pages: {} } })
			});
		});

		page.on("console", (msg) => {
			if (msg.type() === "error") console.log("PAGE ERROR:", msg.text());
		});

		await page.goto("./p/en/Albert_Einstein");
		await expect(page.locator("#loading")).toBeHidden({ timeout: 30_000 });
		await finishOnboarding(page);
		await expect(page.locator("#shortsFeed")).toBeVisible({ timeout: 30_000 });
	});
});
