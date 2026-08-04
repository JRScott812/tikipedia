import type { FollowedTopic, Post, TopicGroup } from "../types/wiki";

const FALLBACK_OTHER: TopicGroup = {
	id: "other",
	label: "Other",
	emoji: "✨",
	wikiPage: "",
	accent: "#2cafff",
	patterns: []
};

/** Normalize a category key (strip Category: prefix, underscores → spaces, lower). */
export function convertCat(category: string | null | undefined): string {
	return String(category || "")
		.replace(/^Category:/i, "")
		.replace(/_/g, " ")
		.trim()
		.toLowerCase();
}

export function isNoiseTopic(
	category: string | null | undefined,
	topicNoiseRe: RegExp[]
): boolean {
	const name = String(category || "")
		.toLowerCase()
		.trim();
	if (!name || name.startsWith("p:")) return true;
	return topicNoiseRe.some((re) => re.test(name));
}

export function formatTopicLabel(category: string | null | undefined): string {
	const raw = convertCat(category);
	return String(raw)
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function classifyTopicGroup(
	category: string | null | undefined,
	topicGroups: TopicGroup[]
): TopicGroup {
	const name = String(category || "").toLowerCase();
	const groups = topicGroups.length ? topicGroups : [FALLBACK_OTHER];
	for (const group of groups) {
		if (group.id === "other") continue;
		if (group.id === "science" && /\bfiction\b/.test(name)) continue;
		if (group.patterns.some((re) => re.test(name))) return group;
	}
	return groups[groups.length - 1] ?? FALLBACK_OTHER;
}

export function classifyPostTopic(
	post: Post | null | undefined,
	topicGroups: TopicGroup[]
): TopicGroup {
	const groups = topicGroups.length ? topicGroups : [FALLBACK_OTHER];
	const scores = new Map<string, number>();
	const addMatch = (text: string | null | undefined, weight: number) => {
		const name = String(text || "").toLowerCase();
		groups.forEach((group) => {
			if (group.id === "other") return;
			if (group.id === "science" && /\bfiction\b/.test(name)) return;
			if (group.patterns.some((re) => re.test(name)))
				scores.set(group.id, (scores.get(group.id) || 0) + weight);
		});
	};
	addMatch(post?.title, 3);
	(post?.categories || []).forEach((category) => addMatch(category, 1));
	let best = groups[groups.length - 1] ?? FALLBACK_OTHER;
	let bestScore = 0;
	groups.forEach((group) => {
		const score = scores.get(group.id) || 0;
		if (score > bestScore) {
			best = group;
			bestScore = score;
		}
	});
	return best;
}

export function getFollowedTopics(
	categoryScores: Record<string, number>,
	topicGroups: TopicGroup[],
	topicNoiseRe: RegExp[],
	limit = 48
): FollowedTopic[] {
	return Object.entries(categoryScores)
		.filter(
			([category, score]) =>
				!isNoiseTopic(category, topicNoiseRe) &&
				Number.isFinite(Number(score)) &&
				Number(score) > 0
		)
		.sort((a, b) => Number(b[1]) - Number(a[1]))
		.slice(0, limit)
		.map(([category, score]) => {
			const group = classifyTopicGroup(category, topicGroups);
			return {
				category,
				score: Number(score),
				group,
				label: formatTopicLabel(category)
			};
		});
}
