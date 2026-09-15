/** Topic groups presented as "accounts" that post shorts, TikTok-style. */
import type { TopicGroup } from "../types/wiki";

/** `@handle` shown for a topic-group account (stable, based on the group id). */
export function accountHandle(group: Pick<TopicGroup, "id">): string {
	return `@${group.id}`;
}

export function findAccount(
	id: string | null | undefined,
	topicGroups: TopicGroup[]
): TopicGroup | null {
	if (!id) return null;
	return topicGroups.find((g) => g.id === id) || null;
}

export interface AccountRow {
	group: TopicGroup;
	/** Rolled-up engagement score across every category classified into this group. */
	score: number;
}

/** Roll per-category engagement scores up to their parent topic-group account. */
export function rollUpAccountScores(
	categoryScores: Record<string, number>,
	classify: (category: string) => TopicGroup
): Map<string, number> {
	const totals = new Map<string, number>();
	for (const [category, score] of Object.entries(categoryScores)) {
		const n = Number(score);
		if (!Number.isFinite(n) || n <= 0 || category.startsWith("p:")) continue;
		const group = classify(category);
		totals.set(group.id, (totals.get(group.id) || 0) + n);
	}
	return totals;
}

/** Accounts the user explicitly follows, ordered by engagement (most active first). */
export function getFollowedAccounts(
	followedIds: string[],
	topicGroups: TopicGroup[],
	scoreById: Map<string, number>
): AccountRow[] {
	const set = new Set(followedIds);
	return topicGroups
		.filter((g) => set.has(g.id))
		.map((group) => ({ group, score: scoreById.get(group.id) || 0 }))
		.sort((a, b) => b.score - a.score);
}

/** Accounts not yet followed, suggested by past engagement (highest score first). */
export function getSuggestedAccounts(
	followedIds: string[],
	topicGroups: TopicGroup[],
	scoreById: Map<string, number>
): AccountRow[] {
	const set = new Set(followedIds);
	return topicGroups
		.filter((g) => !set.has(g.id))
		.map((group) => ({ group, score: scoreById.get(group.id) || 0 }))
		.sort((a, b) => b.score - a.score);
}
