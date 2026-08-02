import { describe, expect, it } from "vitest";
import type { Post } from "../types/wiki";
import { apiPageToPost, pickScoredPost, scoreCandidate } from "./wiki";

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
