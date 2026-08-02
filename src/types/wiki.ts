/** Wikipedia language edition available in the app. */
export interface WikiLang {
	code: string;
	label: string;
	bcp47: string;
	preview: string;
}

/** Persisted app settings (`tikipedia-settings`). */
export interface Settings {
	storeData: boolean;
	openMainWiki: boolean;
	wikiLang: string;
	profile: string;
	profiles: string[];
	theme: "theme-auto" | "theme-light" | "theme-dark" | string;
	muted: boolean;
	voiceURI: string;
	speechRate: number;
	voiceAutoMatched: boolean;
	captionSize: number;
	captionStroke: number;
}

/** Per-language recommendation / engagement slice. */
export interface LangSlice {
	categoryScores: Record<string, number>;
	seenPosts: number[];
	likedPosts: number[];
	dislikedPosts: number[];
}

/** Persisted profile document (`tikipedia-profile-{id}`). */
export interface ProfileStore {
	profileName: string;
	timeSpentTotal: number;
	byLang: Record<string, LangSlice>;
}

/** Flat legacy profile shape before byLang migration. */
export interface LegacyProfileFlat {
	profileName?: string;
	timeSpentTotal?: number;
	categoryScores?: Record<string, number>;
	seenPosts?: number[];
	likedPosts?: number[];
	dislikedPosts?: number[];
}

/** Piped wiki-link reference from lead wikitext. */
export interface WikiLinkRef {
	target: string;
	label: string;
}

/** Related page mention found in a post summary. */
export interface RelatedInSummary {
	id: number;
	page: Post;
	title: string;
	label: string;
}

/** Feed post / cached wiki page. */
export interface Post {
	title: string;
	id: number;
	wikiLang: string;
	text: string;
	thumb: string | null;
	categories: string[];
	linkTitles: string[];
	links: number[];
	images: string[];
	allCategories: Set<string>;
	seen: number;
	aliases: string[];
	score?: number;
	_summaryLinkRefs?: WikiLinkRef[];
	_relatedInSummary?: RelatedInSummary[];
}

/** Topic group from topics.json (patterns compiled to RegExp). */
export interface TopicGroup {
	id: string;
	label: string;
	emoji: string;
	wikiPage: string;
	accent: string;
	patterns: RegExp[];
}

/** Followed topic row for the Following screen. */
export interface FollowedTopic {
	category: string;
	score: number;
	group: TopicGroup;
	label: string;
}

/** Post route parsed from the URL. */
export interface PostRoute {
	lang: string | null;
	slug: string;
}
