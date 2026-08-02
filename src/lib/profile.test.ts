import { beforeEach, describe, expect, it } from "vitest";
import type { WikiLang } from "../types/wiki";
import {
	clampCaptionSize,
	clampCaptionStroke,
	defaultSettings,
	loadSettings,
	migrateProfileShape,
	saveSettings,
	SETTINGS_KEY
} from "./profile";

const langs: WikiLang[] = [
	{ code: "simple", label: "Simple", bcp47: "en", preview: "Hi" },
	{ code: "en", label: "English", bcp47: "en-US", preview: "Hi" }
];

describe("caption clamps", () => {
	it("clamps size and stroke", () => {
		expect(clampCaptionSize(0.1)).toBe(0.7);
		expect(clampCaptionSize(2)).toBe(1.5);
		expect(clampCaptionStroke(-1)).toBe(0);
		expect(clampCaptionStroke(9)).toBe(5);
	});
});

describe("settings persistence", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("loads defaults when empty", () => {
		expect(loadSettings(langs)).toMatchObject(defaultSettings());
	});

	it("round-trips settings and fixes invalid wikiLang", () => {
		saveSettings({
			...defaultSettings(),
			wikiLang: "zz",
			captionSize: 1.2
		});
		const loaded = loadSettings(langs);
		expect(loaded.wikiLang).toBe("simple");
		expect(loaded.captionSize).toBe(1.2);
		expect(localStorage.getItem(SETTINGS_KEY)).toBeTruthy();
	});
});

describe("migrateProfileShape", () => {
	it("keeps byLang profiles", () => {
		const migrated = migrateProfileShape(
			{
				profileName: "Me",
				timeSpentTotal: 10,
				byLang: {
					en: {
						categoryScores: { science: 5 },
						seenPosts: [1],
						likedPosts: [],
						dislikedPosts: []
					}
				}
			},
			"en"
		);
		expect(migrated.profileName).toBe("Me");
		expect(migrated.byLang.en.categoryScores.science).toBe(5);
	});

	it("wraps flat legacy shape into byLang", () => {
		const migrated = migrateProfileShape(
			{
				profileName: "Old",
				timeSpentTotal: 3,
				categoryScores: { history: 2 },
				seenPosts: [9],
				likedPosts: [9],
				dislikedPosts: []
			},
			"simple"
		);
		expect(migrated.byLang.simple.categoryScores.history).toBe(2);
		expect(migrated.byLang.simple.likedPosts).toEqual([9]);
	});
});
