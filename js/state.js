// Single shared runtime store. Feature modules intentionally access this object
// so mutable feed, playback, profile, and DOM state has one source of truth.
export const state = Object.assign(Object.create(null), {
	pageCache: new Map(),
	categoryScores: {
		"given names": -1000,
		"surnames": -1000,
	},
	seenPosts: [],
	likedPosts: [],
	dislikedPosts: [],
	likesLen: 0,
	timeSpentSession: 0,
	timeSpentTotal: 0,
	profileName: "Default",
	lastSpentTime: Date.now(),
	defaultCategories: [],
	postsWithoutLike: 0,
});
