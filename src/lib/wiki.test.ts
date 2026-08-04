import { describe, expect, it } from "vitest";
import type { Post } from "../types/wiki";
import {
	apiPageToPost,
	filterTopLevelSections,
	getSpokenSectionTitle,
	getSpokenText,
	htmlToPlainSectionText,
	isJunkSectionTitle,
	pickScoredPost,
	scoreCandidate,
	stripWikiCitations
} from "./wiki";

function makePost(partial: Partial<Post> & Pick<Post, "id" | "title">): Post {
	return {
		wikiLang: "simple",
		text: "A".repeat(40),
		thumb: null,
		categories: [],
		linkTitles: [],
		links: [],
		images: [],
		allCategories: new Set(),
		seen: 0,
		aliases: [],
		...partial
	};
}

const scoreDeps = {
	categoryScores: {} as Record<string, number>,
	likedPosts: [] as number[],
	dislikedPosts: [] as number[]
};

describe("apiPageToPost", () => {
	it("maps a valid page", () => {
		const post = apiPageToPost(
			{
				pageid: 42,
				title: "Sun",
				extract: "The Sun is the star at the center of the Solar System. ".repeat(
					2
				),
				categories: [{ title: "Category:Stars" }],
				links: [{ title: "Earth" }],
				pageimage: "Sun.jpg"
			},
			"simple"
		);
		expect(post?.id).toBe(42);
		expect(post?.title).toBe("Sun");
		expect(post?.categories).toContain("stars");
		expect(post?.thumb).toBeTruthy();
	});

	it("skips missing / short extracts", () => {
		expect(apiPageToPost({ pageid: 1, title: "X", missing: true }, "en")).toBeNull();
		expect(
			apiPageToPost({ pageid: 2, title: "Y", extract: "too short" }, "en")
		).toBeNull();
	});
});

describe("scoreCandidate / pickScoredPost", () => {
	it("boosts thumbs and likes; penalizes seen and disliked", () => {
		const deps = {
			categoryScores: { science: 10 },
			likedPosts: [2],
			dislikedPosts: [3]
		};

		const fresh = makePost({
			id: 1,
			title: "A",
			thumb: "File:A.jpg",
			allCategories: new Set(["science"])
		});
		const disliked = makePost({
			id: 3,
			title: "C",
			allCategories: new Set(["science"])
		});
		const seen = makePost({
			id: 4,
			title: "D",
			seen: 1,
			allCategories: new Set(["science"])
		});

		expect(scoreCandidate(disliked, deps)).toBeLessThan(-50_000);
		expect(scoreCandidate(seen, deps)).toBeLessThan(scoreCandidate(fresh, deps));
	});

	it("picks from a non-empty pool", () => {
		const posts = [
			makePost({ id: 1, title: "A", score: 1 }),
			makePost({ id: 2, title: "B", score: 5 })
		];
		const picked = pickScoredPost(posts, scoreDeps);
		expect([1, 2]).toContain(picked?.id);
	});
});

describe("filterTopLevelSections / junk filter", () => {
	it("keeps toclevel 1 headings and drops junk", () => {
		const sections = filterTopLevelSections([
			{ toclevel: 1, index: "1", line: "History" },
			{ toclevel: 2, index: "2", line: "Early years" },
			{ toclevel: 1, index: "3", line: "References" },
			{ toclevel: 1, index: "4", line: "See also" },
			{ toclevel: 1, index: "5", line: "Geography" },
			{ toclevel: 1, index: "6", line: "External links" }
		]);
		expect(sections).toEqual([
			{ index: 1, title: "History" },
			{ index: 5, title: "Geography" }
		]);
	});

	it("strips HTML from section titles", () => {
		expect(isJunkSectionTitle("Further reading")).toBe(true);
		expect(isJunkSectionTitle("History")).toBe(false);
		const sections = filterTopLevelSections([
			{ toclevel: 1, index: "1", line: "<i>Culture</i>" }
		]);
		expect(sections[0]?.title).toBe("Culture");
	});
});

describe("htmlToPlainSectionText", () => {
	it("strips tags and collapses whitespace without a length cap", () => {
		const plain = htmlToPlainSectionText("<p>Hello   <b>world</b></p>");
		expect(plain).toBe("Hello world");
		const long = htmlToPlainSectionText(`<p>${"x".repeat(800)}</p>`);
		expect(long.length).toBe(800);
	});

	it("removes citation markers from section HTML and plain text", () => {
		const html = htmlToPlainSectionText(
			`<p>The city grew rapidly<sup class="reference"><a href="#cite_note-1">[1]</a></sup> after 1840.<sup id="cite_ref-2"><a href="#cite_note-2">[2]</a></sup></p>`
		);
		expect(html).toBe("The city grew rapidly after 1840.");
		expect(html).not.toMatch(/\[\d+\]/);

		const chained = stripWikiCitations(
			"Trade expanded[1][2][3] in the 1800s.[note 1]"
		);
		expect(chained).toBe("Trade expanded in the 1800s.");
	});
});

describe("getSpokenText / getSpokenSectionTitle", () => {
	it("defaults to summary when playback is null or for another post", () => {
		const post = makePost({ id: 1, title: "A", text: "Summary text here." });
		expect(getSpokenText(post, null)).toBe("Summary text here.");
		expect(getSpokenSectionTitle(post, null)).toBe("Summary");
		expect(
			getSpokenText(post, {
				postId: 99,
				sectionIndex: 2,
				sectionTitle: "History",
				text: "Other"
			})
		).toBe("Summary text here.");
	});

	it("uses section playback when it matches the post", () => {
		const post = makePost({ id: 1, title: "A", text: "Summary text here." });
		const playback = {
			postId: 1,
			sectionIndex: 3,
			sectionTitle: "History",
			text: "In 1840 the town grew."
		};
		expect(getSpokenText(post, playback)).toBe("In 1840 the town grew.");
		expect(getSpokenSectionTitle(post, playback)).toBe("History");
	});
});
