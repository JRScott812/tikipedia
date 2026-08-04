import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
	buildCaptionWords,
	captionStepMs,
	captionTokenWeight,
	captionWordWeight,
	createSpeechController,
	isMonthToken,
	speakYearEn,
	stripTrailingPunct,
	toSpeechText,
	tokenIndexAtChar,
	type SpeechData
} from "./speech";

const speechData: SpeechData = {
	monthNamesEn: [
		"january",
		"february",
		"march",
		"april",
		"may",
		"june",
		"july",
		"august",
		"september",
		"october",
		"november",
		"december"
	],
	ordinalWords: {
		"1": "first",
		"2": "second",
		"3": "third",
		"15": "fifteenth"
	},
	ones: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"],
	teens: [
		"ten",
		"eleven",
		"twelve",
		"thirteen",
		"fourteen",
		"fifteen",
		"sixteen",
		"seventeen",
		"eighteen",
		"nineteen"
	],
	tens: [
		"",
		"",
		"twenty",
		"thirty",
		"forty",
		"fifty",
		"sixty",
		"seventy",
		"eighty",
		"ninety"
	],
	rangeConnectors: { en: "to" },
	capRoleColors: { date: "#ffe566", other: "#fff" }
};

describe("speech helpers", () => {
	it("speaks years in English", () => {
		expect(speakYearEn(1999, speechData)).toMatch(/nineteen/i);
	});

	it("maps character offsets to token indexes", () => {
		expect(tokenIndexAtChar([0, 5, 10], 6)).toBe(1);
	});

	it("weights caption words", () => {
		expect(captionWordWeight("Hello")).toBeGreaterThan(0);
	});

	it("weights expanded speak forms by spoken word count", () => {
		const plain = { textContent: "in ", dataset: {} };
		const withSpeak = {
			textContent: "1999 ",
			dataset: { speak: "nineteen ninety-nine " }
		};
		const dateSpeak = {
			textContent: "March 15, 1999 ",
			dataset: { speak: "March fifteenth, nineteen ninety-nine " }
		};
		expect(captionTokenWeight(withSpeak)).toBeGreaterThan(captionTokenWeight(plain));
		expect(captionTokenWeight(dateSpeak)).toBeGreaterThan(
			captionTokenWeight(withSpeak)
		);
		expect(captionStepMs(dateSpeak, 1, 1, { mobile: true })).toBeGreaterThan(
			captionStepMs(plain, 1, 1, { mobile: true })
		);
	});

	it("scales timed caption steps with speech rate", () => {
		const word = { textContent: "Hello ", dataset: {} };
		expect(captionStepMs(word, 1, 2)).toBeLessThan(captionStepMs(word, 1, 1));
	});

	it("trims caption trailing spaces before stripping punct", () => {
		expect(stripTrailingPunct("March ").core).toBe("March");
		expect(stripTrailingPunct("15, ").core).toBe("15");
		expect(stripTrailingPunct("15, ").punct).toBe(",");
		expect(isMonthToken("March ", speechData.monthNamesEn)).toBe(true);
		expect(isMonthToken("January", speechData.monthNamesEn)).toBe(true);
	});
});

describe("date caption annotation", () => {
	it("merges Month D, YYYY into one visible caption with spoken form", () => {
		const container = document.createElement("div");
		const spans = buildCaptionWords(
			container,
			"Born March 15, 1999 in Paris.",
			null,
			speechData,
			{ wikiLang: "en", langBcp47: "en" }
		);
		const dateSpan = spans.find((s) => s.dataset.capRole === "date");
		expect(dateSpan?.textContent?.trim()).toBe("March 15, 1999");
		expect(dateSpan?.dataset.speak).toMatch(/fifteenth/i);
		expect(dateSpan?.dataset.speak).toMatch(/nineteen/i);
		// Day/year must not remain as separate karaoke words (blank/desync).
		expect(spans.map((s) => s.textContent?.trim())).not.toContain("15,");
		expect(spans.some((s) => s.textContent?.trim() === "1999")).toBe(false);
	});

	it("merges D Month YYYY and expands for speech", () => {
		const spoken = toSpeechText("Died 3 March 1892 after.", speechData, "simple");
		expect(spoken).toMatch(/third of March/i);
		expect(spoken).toMatch(/eighteen/i);
	});

	it("expands years after date-context words", () => {
		const spoken = toSpeechText("Founded in 1999 by settlers.", speechData, "en");
		expect(spoken).toMatch(/nineteen ninety/i);
	});
});

describe("SpeechController pause/resume", () => {
	const words = () =>
		["One", "two", "three"].map((text) => {
			const el = document.createElement("span");
			el.className = "caption-word";
			el.textContent = `${text} `;
			return el;
		});

	beforeEach(() => {
		vi.stubGlobal("speechSynthesis", {
			speak: vi.fn(),
			cancel: vi.fn(),
			getVoices: () => []
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("clears paused so a second pause actually stops playback", () => {
		const controller = createSpeechController({
			onCaptionIndex: () => {},
			getRate: () => 1,
			getMuted: () => true,
			getVoiceURI: () => "",
			getSpeechRate: () => 1,
			getLangInfo: () => ({ bcp47: "en", code: "en" })
		});
		const w = words();
		controller.speakFrom(w, "One two three", 0);
		expect(controller.isPaused()).toBe(false);

		controller.pause();
		expect(controller.isPaused()).toBe(true);

		controller.resume(w, "One two three");
		expect(controller.isPaused()).toBe(false);

		controller.pause();
		expect(controller.isPaused()).toBe(true);
	});
});
