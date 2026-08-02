import type {
	LangSlice,
	LegacyProfileFlat,
	Post,
	ProfileStore,
	Settings,
	WikiLang
} from "../types/wiki";

export const SETTINGS_KEY = "tikipedia-settings";

export function profileKey(profileId: string): string {
	return `tikipedia-profile-${profileId}`;
}

export function defaultSettings(): Settings {
	return {
		storeData: true,
		openMainWiki: false,
		wikiLang: "simple",
		profile: "default",
		profiles: ["default"],
		theme: "theme-auto",
		muted: false,
		voiceURI: "",
		speechRate: 1,
		voiceAutoMatched: true,
		captionSize: 1,
		captionStroke: 2
	};
}

export function clampCaptionSize(value: unknown): number {
	const n = Number(value);
	if (!Number.isFinite(n)) return 1;
	return Math.min(1.5, Math.max(0.7, Math.round(n * 10) / 10));
}

export function clampCaptionStroke(value: unknown): number {
	const n = Number(value);
	if (!Number.isFinite(n)) return 2;
	return Math.min(5, Math.max(0, Math.round(n * 2) / 2));
}

function parseJsonObject(raw: string | null): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw ?? "{}");
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
			return parsed as Record<string, unknown>;
	} catch {
		/* ignore */
	}
	return {};
}

/** Load settings from localStorage (no DOM). Invalid wikiLang → "simple". */
export function loadSettings(wikiLanguages: WikiLang[]): Settings {
	const base = defaultSettings();
	const loaded = parseJsonObject(localStorage.getItem(SETTINGS_KEY));
	const computed: Settings = Object.assign({}, base, loaded);
	if (!wikiLanguages.some((l) => l.code === computed.wikiLang))
		computed.wikiLang = "simple";
	computed.captionSize = clampCaptionSize(computed.captionSize);
	computed.captionStroke = clampCaptionStroke(computed.captionStroke);
	if (!Array.isArray(computed.profiles)) computed.profiles = ["default"];
	return computed;
}

/** Persist settings to localStorage (caller supplies the full Settings object). */
export function saveSettings(settings: Settings): void {
	const next: Settings = {
		...settings,
		captionSize: clampCaptionSize(settings.captionSize),
		captionStroke: clampCaptionStroke(settings.captionStroke)
	};
	localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

export function getWikiLangInfo(
	wikiLanguages: WikiLang[],
	code?: string | null,
	fallback = "simple"
): WikiLang | undefined {
	const lang = code || fallback;
	return wikiLanguages.find((l) => l.code === lang) || wikiLanguages[0];
}

export function wikiApiBase(lang?: string | null, fallback = "simple"): string {
	return `https://${lang || fallback}.wikipedia.org/w/api.php`;
}

export function wikiSiteHost(lang?: string | null, fallback = "simple"): string {
	return `${lang || fallback}.wikipedia.org`;
}

export function defaultLangSlice(): LangSlice {
	return {
		categoryScores: {
			"given names": -1000,
			surnames: -1000
		},
		seenPosts: [],
		likedPosts: [],
		dislikedPosts: []
	};
}

function isProfileStore(raw: unknown): raw is ProfileStore {
	return (
		raw !== null &&
		typeof raw === "object" &&
		"byLang" in raw &&
		typeof (raw as ProfileStore).byLang === "object" &&
		(raw as ProfileStore).byLang !== null
	);
}

/** Migrate flat old profile shape → `{ byLang: { [lang]: slice } }`. */
export function migrateProfileShape(raw: unknown, wikiLang = "simple"): ProfileStore {
	if (isProfileStore(raw)) {
		return {
			profileName: raw.profileName || "Default",
			timeSpentTotal: raw.timeSpentTotal || 0,
			byLang: raw.byLang
		};
	}
	const flat = (raw ?? {}) as LegacyProfileFlat;
	const slice = defaultLangSlice();
	if (flat.categoryScores) slice.categoryScores = flat.categoryScores;
	if (Array.isArray(flat.seenPosts)) slice.seenPosts = flat.seenPosts;
	if (Array.isArray(flat.likedPosts)) slice.likedPosts = flat.likedPosts;
	if (Array.isArray(flat.dislikedPosts)) slice.dislikedPosts = flat.dislikedPosts;
	return {
		profileName: flat.profileName || "Default",
		timeSpentTotal: flat.timeSpentTotal || 0,
		byLang: { [wikiLang]: slice }
	};
}

export interface AppliedLangSlice {
	categoryScores: Record<string, number>;
	seenPosts: number[];
	likedPosts: number[];
	dislikedPosts: number[];
	likesLen: number;
}

/**
 * Resolve the active language slice and optionally rebuild `post.seen` counts
 * from the seenPosts multiset on a page cache.
 */
export function applyLangSlice(
	profileStore: ProfileStore,
	wikiLang: string,
	pageCache?: Map<number | string, Post>
): AppliedLangSlice {
	if (!profileStore.byLang) profileStore.byLang = {};
	if (!profileStore.byLang[wikiLang])
		profileStore.byLang[wikiLang] = defaultLangSlice();
	const slice = profileStore.byLang[wikiLang];
	const categoryScores = slice.categoryScores || defaultLangSlice().categoryScores;
	const seenPosts = slice.seenPosts || [];
	const likedPosts = slice.likedPosts || [];
	const dislikedPosts = slice.dislikedPosts || [];

	if (pageCache) {
		for (const page of pageCache.values()) page.seen = 0;
		const seenCounts = new Map<number, number>();
		seenPosts.forEach((id) => seenCounts.set(id, (seenCounts.get(id) || 0) + 1));
		seenCounts.forEach((count, id) => {
			const post = pageCache.get(Number(id)) || pageCache.get(String(id)) || null;
			if (post) post.seen = count;
		});
	}

	return {
		categoryScores,
		seenPosts,
		likedPosts,
		dislikedPosts,
		// Session baseline for "shorts watched (session)" = seen at load time.
		likesLen: seenPosts.length
	};
}

/** Write the active language slice back into the profile store. */
export function persistLangSlice(
	profileStore: ProfileStore,
	wikiLang: string,
	slice: Pick<
		LangSlice,
		"categoryScores" | "seenPosts" | "likedPosts" | "dislikedPosts"
	>,
	profileName: string,
	timeSpentTotal: number
): ProfileStore {
	if (!profileStore.byLang) profileStore.byLang = {};
	profileStore.byLang[wikiLang] = {
		categoryScores: slice.categoryScores,
		seenPosts: slice.seenPosts,
		likedPosts: slice.likedPosts,
		dislikedPosts: slice.dislikedPosts
	};
	profileStore.profileName = profileName;
	profileStore.timeSpentTotal = timeSpentTotal;
	return profileStore;
}

export interface LoadedProfile {
	settings: Settings;
	profileStore: ProfileStore;
	profileName: string;
	timeSpentTotal: number;
	slice: AppliedLangSlice;
	hasSeenPosts: boolean;
}

/** Load a profile from localStorage and apply its language slice. */
export function loadProfile(
	profileId: string,
	settings: Settings,
	pageCache?: Map<number | string, Post>
): LoadedProfile {
	const nextSettings: Settings = { ...settings, profile: profileId };
	const loaded = parseJsonObject(localStorage.getItem(profileKey(profileId)));
	const profileStore = migrateProfileShape(loaded, nextSettings.wikiLang || "simple");
	const profileName = profileStore.profileName || "Default";
	const timeSpentTotal = profileStore.timeSpentTotal || 0;
	const slice = applyLangSlice(
		profileStore,
		nextSettings.wikiLang || "simple",
		pageCache
	);
	saveSettings(nextSettings);
	saveProfile(nextSettings.profile, profileStore, nextSettings.storeData);
	return {
		settings: nextSettings,
		profileStore,
		profileName,
		timeSpentTotal,
		slice,
		hasSeenPosts: !!slice.seenPosts.length
	};
}

export function saveProfile(
	profileId: string,
	profileStore: ProfileStore,
	storeData: boolean
): void {
	if (!storeData) return;
	localStorage.setItem(profileKey(profileId), JSON.stringify(profileStore));
}

/** Ensure profiles list / active id are valid, then load the active profile. */
export function initProfile(
	settings: Settings,
	pageCache?: Map<number | string, Post>
): LoadedProfile | false {
	if (!settings.storeData) return false;
	const next = { ...settings };
	if (!next.profiles.length) next.profiles.push("default");
	if (!next.profiles.includes(next.profile)) next.profile = next.profiles[0];
	return loadProfile(next.profile, next, pageCache);
}

export function addProfile(
	newProfileName: string,
	settings: Settings
): { profileId: string; settings: Settings } {
	const profileId = Math.random().toString(36).slice(2);
	localStorage.setItem(
		profileKey(profileId),
		JSON.stringify({ profileName: newProfileName })
	);
	const next: Settings = {
		...settings,
		profiles: [...settings.profiles, profileId]
	};
	return { profileId, settings: next };
}

export function deleteProfile(profileId: string, settings: Settings): Settings {
	localStorage.removeItem(profileKey(profileId));
	return {
		...settings,
		profiles: settings.profiles.filter((e) => e !== profileId)
	};
}

/** Clear one profile's persisted recommendation data. */
export function clearProfileData(profileId: string): void {
	localStorage.removeItem(profileKey(profileId));
}

/** Remove settings + all profile keys listed in settings.profiles. */
export function clearAllPersistedData(settings: Settings): void {
	for (const id of settings.profiles) {
		localStorage.removeItem(profileKey(id));
	}
	localStorage.removeItem(SETTINGS_KEY);
}

export function readProfileDisplayName(profileId: string): string {
	const loaded = parseJsonObject(localStorage.getItem(profileKey(profileId)));
	const name = loaded.profileName;
	return typeof name === "string" && name ? name : profileId;
}

/** Caption CSS custom-property values derived from settings. */
export function captionCssVars(settings: Settings): {
	captionSize: string;
	captionStroke: string;
} {
	const size = clampCaptionSize(settings.captionSize);
	const stroke = clampCaptionStroke(settings.captionStroke);
	return {
		captionSize: String(size),
		captionStroke: `${stroke}px`
	};
}

export function themeIsLight(
	theme: string | null | undefined,
	prefersLight: boolean
): boolean {
	const t = theme ?? "theme-auto";
	if (t === "theme-light") return true;
	if (t === "theme-dark") return false;
	return prefersLight;
}
