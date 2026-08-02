import { describe, expect, it } from "vitest";
import type { WikiLang } from "../types/wiki";
import {
	appPagePath,
	postPathForRoute,
	readAppPageFromLocation,
	readPostRouteFromLocation,
	slugToTitle,
	titleToSlug
} from "./routes";

const langs: WikiLang[] = [
	{ code: "simple", label: "Simple", bcp47: "en", preview: "Hello" },
	{ code: "en", label: "English", bcp47: "en-US", preview: "Hello" }
];

describe("titleToSlug / slugToTitle", () => {
	it("round-trips titles with spaces", () => {
		expect(titleToSlug("Albert Einstein")).toBe("Albert_Einstein");
		expect(slugToTitle("Albert_Einstein")).toBe("Albert Einstein");
	});

	it("handles encoded slugs", () => {
		expect(slugToTitle(titleToSlug("C++"))).toBe("C++");
	});
});

describe("postPathForRoute", () => {
	it("builds canonical /p/{lang}/{slug} paths", () => {
		expect(
			postPathForRoute(
				{ lang: "en", slug: "Albert_Einstein" },
				langs,
				"simple",
				"/xikipedia/"
			)
		).toBe("/xikipedia/p/en/Albert_Einstein");
	});
});

describe("readPostRouteFromLocation", () => {
	it("parses /p/{lang}/{slug}", () => {
		const route = readPostRouteFromLocation(
			langs,
			{
				pathname: "/xikipedia/p/en/Albert_Einstein",
				search: "",
				hash: "",
				origin: "https://example.com"
			},
			"/xikipedia/"
		);
		expect(route).toEqual({ lang: "en", slug: "Albert_Einstein" });
	});

	it("parses legacy /p/{slug} without lang", () => {
		const route = readPostRouteFromLocation(
			langs,
			{
				pathname: "/xikipedia/p/Sun",
				search: "",
				hash: "",
				origin: "https://example.com"
			},
			"/xikipedia/"
		);
		expect(route).toEqual({ lang: null, slug: "Sun" });
	});

	it("parses ?p= and ?lang=", () => {
		const route = readPostRouteFromLocation(
			langs,
			{
				pathname: "/xikipedia/",
				search: "?p=Albert_Einstein&lang=en",
				hash: "",
				origin: "https://example.com"
			},
			"/xikipedia/"
		);
		expect(route.slug).toBe("Albert_Einstein");
		expect(route.lang).toBe("en");
	});
});

describe("app pages", () => {
	it("builds and reads app page paths", () => {
		expect(appPagePath("settings", "/xikipedia/")).toBe("/xikipedia/settings");
		expect(
			readAppPageFromLocation(
				{
					pathname: "/xikipedia/settings",
					search: "",
					hash: "",
					origin: "https://example.com"
				},
				"/xikipedia/"
			)
		).toBe("settings");
	});
});
