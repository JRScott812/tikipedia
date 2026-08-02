import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
	captionWordWeight,
	createSpeechController,
	speakYearEn,
	tokenIndexAtChar,
	type SpeechData
} from "./speech";

const speechData: SpeechData = {
	monthNamesEn: [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December"
	],
	ordinalWords: { "1": "first", "2": "second" },
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
	capRoleColors: {}
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
