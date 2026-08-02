import { basePath } from "./path";
import type { TopicGroup, WikiLang } from "../types/wiki";

export const APP_VERSION = __APP_VERSION__;

export const PREFETCH_AHEAD = 3;
export const RELATED_LINK_CAP = 8;
export const DOUBLE_TAP_MS = 260;
export const IMAGE_SLIDE_MS = 3500;
/** Minimum time to keep a caption-linked article image on screen. */
export const LINK_IMAGE_MIN_MS = 2500;
/** Start showing a linked image this many caption words early. */
export const LINK_IMAGE_LOOKAHEAD = 4;

export const APP_DATA_FILES = [
	"data/languages.json",
	"data/topics.json",
	"data/speech.json",
	"data/captions.json",
	"data/junk-images.json"
] as const;

export interface LanguagesJson {
	languages?: WikiLang[];
	rangeConnectors?: Record<string, string>;
}

export interface TopicsJson {
	defaultCategories?: string[];
	groups?: Array<{
		id: string;
		label: string;
		emoji: string;
		wikiPage: string;
		accent: string;
		patterns?: string[];
	}>;
	noise?: string[];
}

export interface SpeechJson {
	monthsEn?: string[];
	ordinals?: Record<string, string>;
	ones?: string[];
	teens?: string[];
	tens?: string[];
}

export interface CaptionsJson {
	roleColors?: Record<string, string>;
	roleLabels?: Record<string, string>;
}

export interface JunkImagesJson {
	patterns?: string[];
}

/** Runtime config loaded from `public/data/*.json`. */
export interface AppData {
	wikiLanguages: WikiLang[];
	rangeConnectors: Record<string, string>;
	defaultCategories: string[];
	topicGroups: TopicGroup[];
	topicNoiseRe: RegExp[];
	monthNamesEn: string[];
	ordinalWords: Record<string, string>;
	ones: string[];
	teens: string[];
	tens: string[];
	capRoleColors: Record<string, string>;
	capRoleLabels: Record<string, string>;
	junkImageRe: RegExp;
}

async function fetchJson(path: string): Promise<unknown> {
	// no-cache: empty-cache hard refresh must still hit the network.
	const res = await fetch(basePath(path), { cache: "no-cache" });
	if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
	return res.json() as Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

/** Load and compile static app data (languages, topics, speech, captions, junk). */
export async function loadAppData(): Promise<AppData> {
	const [languagesRaw, topicsRaw, speechRaw, captionsRaw, junkRaw] = await Promise.all(
		APP_DATA_FILES.map((path) => fetchJson(path))
	);

	const languages = asRecord(languagesRaw) as LanguagesJson;
	const topics = asRecord(topicsRaw) as TopicsJson;
	const speech = asRecord(speechRaw) as SpeechJson;
	const captions = asRecord(captionsRaw) as CaptionsJson;
	const junk = asRecord(junkRaw) as JunkImagesJson;

	const topicGroups: TopicGroup[] = (topics.groups || []).map((group) => ({
		id: group.id,
		label: group.label,
		emoji: group.emoji,
		wikiPage: group.wikiPage,
		accent: group.accent,
		patterns: (group.patterns || []).map((source) => new RegExp(source, "i"))
	}));

	const junkParts = (junk.patterns || []).filter(Boolean);
	const junkImageRe = junkParts.length
		? new RegExp(`(?:^File:)?(?:${junkParts.join("|")})`, "i")
		: /(?!)/;

	return {
		wikiLanguages: languages.languages || [],
		rangeConnectors: languages.rangeConnectors || {},
		defaultCategories: topics.defaultCategories || [],
		topicGroups,
		topicNoiseRe: (topics.noise || []).map((source) => new RegExp(source, "i")),
		monthNamesEn: speech.monthsEn || [],
		ordinalWords: speech.ordinals || {},
		ones: speech.ones || [],
		teens: speech.teens || [],
		tens: speech.tens || [],
		capRoleColors: captions.roleColors || {},
		capRoleLabels: captions.roleLabels || {},
		junkImageRe
	};
}
