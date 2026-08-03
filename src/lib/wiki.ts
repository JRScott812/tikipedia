import { PREFETCH_AHEAD, RELATED_LINK_CAP } from "./config";
import { wikiApiBase, wikiSiteHost } from "./profile";
import { postUrl } from "./routes";
import { convertCat, isNoiseTopic } from "./topics";
import type {
	ArticleSection,
	Post,
	RelatedInSummary,
	SectionPlayback,
	Settings,
	WikiLang,
	WikiLinkRef
} from "../types/wiki";

const WIKI_CACHE_MAX = 200;
const WIKI_MAX_CONCURRENT = 2;
const SECTION_TEXT_MAX = 600;
const SECTION_TEXT_MIN = 20;
const WIKI_USER_AGENT =
	"Tikipedia/3.0 (https://github.com/JRScott812/tikipedia; live-feed)";

/** English junk TOC headings hidden from the playable section list. */
export const JUNK_SECTION_TITLES = new Set([
	"references",
	"see also",
	"external links",
	"notes",
	"further reading",
	"bibliography"
]);

const wikiQueryCache = new Map<string, Promise<unknown>>();
const pageCache = new Map<number | string, Post>();
const summaryLinkRefCache = new Map<string, WikiLinkRef[]>();
const sectionLinkRefCache = new Map<string, WikiLinkRef[]>();
const sectionTextCache = new Map<string, string>();

let wikiInFlight = 0;
const wikiWaiters: Array<() => void> = [];

export type WikiParams = Record<string, string | number | boolean | null | undefined>;

export interface EngagementDeps {
	seenPosts: number[];
	likedPosts: number[];
	dislikedPosts: number[];
	categoryScores: Record<string, number>;
	timeSpentTotal: number;
	timeSpentSession: number;
	lastSpentTime: number;
	postsWithoutLike: number;
}

export interface WikiFeedDeps {
	getVisiblePostIds: () => number[];
	getSettings: () => Settings;
	getCandidateQueue: () => Post[];
	getEngagement: () => EngagementDeps;
	getTopicNoiseRe: () => RegExp[];
}

interface MwPage {
	pageid?: number;
	title?: string;
	missing?: unknown;
	invalid?: unknown;
	pageprops?: { disambiguation?: unknown };
	extract?: string;
	categories?: Array<{ title?: string }>;
	links?: Array<{ title?: string }>;
	pageimage?: string;
	original?: { source?: string };
}

interface MwParseSection {
	toclevel?: number;
	level?: string | number;
	line?: string;
	index?: string | number;
	number?: string;
	anchor?: string;
}

interface MwQueryData {
	query?: {
		pages?: Record<string, MwPage>;
		redirects?: Array<{ from?: string; to?: string }>;
		normalized?: Array<{ from?: string; to?: string }>;
	};
	parse?: {
		wikitext?: { "*": string };
		text?: { "*": string };
		sections?: MwParseSection[];
	};
}

function normalizeFileTitle(name: string | null | undefined): string {
	if (!name) return "";
	let t = String(name).trim();
	t = t.replace(/^\[\[/, "").replace(/\]\]$/, "");
	t = t.split("|")[0].trim();
	t = t
		.replace(/^File:/i, "")
		.replace(/^Image:/i, "")
		.trim();
	return t.replace(/ /g, "_");
}

export function wikiCacheKey(params: WikiParams): string {
	return Object.keys(params)
		.sort()
		.map((k) => `${k}=${params[k]}`)
		.join("&");
}

function acquireWikiSlot(): Promise<void> {
	if (wikiInFlight < WIKI_MAX_CONCURRENT) {
		wikiInFlight++;
		return Promise.resolve();
	}
	return new Promise<void>((resolve) => {
		wikiWaiters.push(resolve);
	}).then(() => {
		wikiInFlight++;
	});
}

function releaseWikiSlot(): void {
	wikiInFlight = Math.max(0, wikiInFlight - 1);
	const next = wikiWaiters.shift();
	if (next) next();
}

export async function wikiQuery(
	params: WikiParams,
	opts: { useCache?: boolean; lang?: string; settingsWikiLang?: string } = {}
): Promise<unknown> {
	const { useCache = true, lang, settingsWikiLang = "simple" } = opts;
	const merged: WikiParams = {
		format: "json",
		origin: "*",
		...params
	};
	const key = `${lang || settingsWikiLang}|${wikiCacheKey(merged)}`;
	if (useCache && wikiQueryCache.has(key)) return wikiQueryCache.get(key);

	const promise = (async () => {
		await acquireWikiSlot();
		try {
			const url = new URL(wikiApiBase(lang, settingsWikiLang));
			Object.entries(merged).forEach(([k, v]) => {
				if (v != null && v !== "") url.searchParams.set(k, String(v));
			});
			const res = await fetch(url.toString(), {
				headers: { "Api-User-Agent": WIKI_USER_AGENT }
			});
			if (!res.ok) throw new Error(`wiki ${res.status}`);
			return await res.json();
		} finally {
			releaseWikiSlot();
		}
	})();

	if (useCache) {
		wikiQueryCache.set(key, promise);
		if (wikiQueryCache.size > WIKI_CACHE_MAX) {
			const first = wikiQueryCache.keys().next().value;
			if (first !== undefined) wikiQueryCache.delete(first);
		}
	}
	try {
		return await promise;
	} catch (err) {
		wikiQueryCache.delete(key);
		throw err;
	}
}

export function getPageCache(): Map<number | string, Post> {
	return pageCache;
}

export function clearLiveCaches(candidateQueue?: Post[]): void {
	pageCache.clear();
	wikiQueryCache.clear();
	summaryLinkRefCache.clear();
	sectionLinkRefCache.clear();
	sectionTextCache.clear();
	if (candidateQueue) candidateQueue.length = 0;
}

export function cachePage(page: Post | null | undefined): Post | null | undefined {
	if (!page?.id) return page;
	const prev = pageCache.get(page.id);
	if (prev) {
		page.seen = page.seen ?? prev.seen;
		Object.assign(prev, page);
		if (page.allCategories) prev.allCategories = page.allCategories;
		return prev;
	}
	pageCache.set(page.id, page);
	return page;
}

export function getPageById(pageId: number | string): Post | null {
	return pageCache.get(Number(pageId)) || pageCache.get(String(pageId)) || null;
}

export function getPageByTitle(title: string | null | undefined): Post | null {
	if (!title) return null;
	const needle = title.toLowerCase();
	for (const page of pageCache.values()) {
		if (page.title?.toLowerCase() === needle) return page;
		if ((page.aliases || []).some((a) => String(a).toLowerCase() === needle))
			return page;
	}
	return null;
}

export function addPageAlias(
	page: Post | null | undefined,
	alias: string | null | undefined
): void {
	if (!page || !alias) return;
	const clean = String(alias).replace(/_/g, " ").trim();
	if (!clean) return;
	const aliases = new Set(page.aliases || []);
	aliases.add(clean);
	if (page.title) aliases.add(page.title);
	page.aliases = [...aliases];
}

export function buildAllCategories(
	categories: string[] = [],
	pageId: number | null | undefined,
	linkIds: number[] = [],
	topicNoiseRe: RegExp[] = []
): Set<string> {
	const keys = new Set(
		categories
			.map(convertCat)
			.filter((category) => category && !isNoiseTopic(category, topicNoiseRe))
	);
	if (pageId) keys.add(`p:${pageId}`);
	for (const id of linkIds || []) if (id) keys.add(`p:${id}`);
	return keys;
}

/** Index pages from a query result, honoring redirects/normalization. */
export function indexQueryPages(data: MwQueryData): {
	resolve: (title: string) => Post | null;
	redirectTo: Map<string, string>;
	byTitle: Map<string, Post>;
} {
	const redirectTo = new Map<string, string>();
	for (const r of data?.query?.redirects || [])
		if (r.from && r.to) redirectTo.set(r.from, r.to);
	for (const n of data?.query?.normalized || [])
		if (n.from && n.to) redirectTo.set(n.from, n.to);

	const byTitle = new Map<string, Post>();
	for (const page of Object.values(data?.query?.pages || {})) {
		if (!page.pageid || page.missing != null) continue;
		const prev = getPageById(page.pageid);
		const thumb = page.pageimage
			? normalizeFileTitle(page.pageimage)
			: prev?.thumb || null;
		const cached = cachePage({
			id: page.pageid,
			title: page.title || "",
			wikiLang: prev?.wikiLang || "simple",
			thumb,
			text: prev?.text || "",
			categories: prev?.categories || [],
			links: prev?.links || [],
			linkTitles: prev?.linkTitles || [],
			images: prev?.images || (thumb ? [thumb] : []),
			allCategories: prev?.allCategories || buildAllCategories([], page.pageid, []),
			seen: prev?.seen || 0,
			aliases: prev?.aliases || []
		});
		if (!cached) continue;
		addPageAlias(cached, page.title);
		if (page.title) byTitle.set(page.title, cached);
	}

	const resolve = (title: string): Post | null => {
		let t = title;
		const seen = new Set<string>();
		while (redirectTo.has(t) && !seen.has(t)) {
			seen.add(t);
			t = redirectTo.get(t)!;
		}
		const page = byTitle.get(t) || getPageByTitle(t);
		if (page && title !== page.title) addPageAlias(page, title);
		return page || null;
	};

	return { resolve, redirectTo, byTitle };
}

/** Pull [[target|label]] refs from lead wikitext so piped labels match spoken text. */
export function parseWikiLinkRefs(wikitext: string | null | undefined): WikiLinkRef[] {
	const refs: WikiLinkRef[] = [];
	const seen = new Set<string>();
	const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(String(wikitext || "")))) {
		const target = m[1].trim().replace(/_/g, " ");
		if (!target || /[:/]/.test(target)) continue; // skip namespaces / interwiki
		const label = (m[2] != null ? m[2] : target)
			.replace(/_/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (!label || label.length < 2) continue;
		const key = `${target.toLowerCase()}\0${label.toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		refs.push({ target, label });
	}
	return refs;
}

export function isJunkSectionTitle(title: string | null | undefined): boolean {
	const key = String(title || "")
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
	return JUNK_SECTION_TITLES.has(key);
}

/** Keep top-level TOC rows; drop English junk headings. */
export function filterTopLevelSections(
	raw: Array<{ toclevel?: number; line?: string; index?: string | number }>
): ArticleSection[] {
	const out: ArticleSection[] = [];
	const seen = new Set<number>();
	for (const s of raw || []) {
		if (Number(s.toclevel) !== 1) continue;
		const title = String(s.line || "")
			.replace(/<[^>]+>/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (!title || isJunkSectionTitle(title)) continue;
		const index = Number(s.index);
		if (!Number.isFinite(index) || index < 1 || seen.has(index)) continue;
		seen.add(index);
		out.push({ index, title });
	}
	return out;
}

/** Strip MediaWiki HTML extract to plain text and cap length. */
export function htmlToPlainSectionText(
	html: string | null | undefined,
	maxChars = SECTION_TEXT_MAX
): string {
	const raw = String(html || "");
	if (!raw.trim()) return "";
	let text = "";
	if (typeof DOMParser !== "undefined") {
		const doc = new DOMParser().parseFromString(raw, "text/html");
		text = doc.body?.textContent || "";
	} else {
		text = raw.replace(/<[^>]+>/g, " ");
	}
	return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

export function getSpokenText(
	post: Post | null | undefined,
	playback: SectionPlayback | null | undefined
): string {
	if (!post) return "";
	if (playback && playback.postId === post.id && playback.text) return playback.text;
	return post.text || "";
}

export function getSpokenSectionTitle(
	post: Post | null | undefined,
	playback: SectionPlayback | null | undefined
): string {
	if (post && playback && playback.postId === post.id && playback.sectionTitle) {
		return playback.sectionTitle;
	}
	return "Summary";
}

export async function fetchTopLevelSections(
	post: Post,
	settingsWikiLang: string
): Promise<ArticleSection[]> {
	if (!post?.title) return [];
	if (post._sections) return post._sections;
	try {
		const data = (await wikiQuery(
			{
				action: "parse",
				page: post.title,
				prop: "sections",
				disablelimitreport: 1
			},
			{ settingsWikiLang }
		)) as MwQueryData;
		const sections = filterTopLevelSections(data?.parse?.sections || []);
		post._sections = sections;
		return sections;
	} catch (err) {
		console.warn("fetchTopLevelSections failed", err);
		post._sections = [];
		return [];
	}
}

export async function fetchSectionPlaintext(
	post: Post,
	sectionIndex: number,
	settingsWikiLang: string
): Promise<string> {
	if (!post?.title) return "";
	if (sectionIndex === 0) return (post.text || "").slice(0, SECTION_TEXT_MAX);
	const cacheKey = `${settingsWikiLang}:${post.title}:${sectionIndex}`;
	if (sectionTextCache.has(cacheKey)) return sectionTextCache.get(cacheKey) || "";

	const data = (await wikiQuery(
		{
			action: "parse",
			page: post.title,
			prop: "text|wikitext",
			section: sectionIndex,
			disableeditsection: 1,
			disablelimitreport: 1
		},
		{ settingsWikiLang }
	)) as MwQueryData;

	const plain = htmlToPlainSectionText(data?.parse?.text?.["*"]);
	if (plain.length >= SECTION_TEXT_MIN) {
		sectionTextCache.set(cacheKey, plain);
	}
	const wikitext = data?.parse?.wikitext?.["*"] || "";
	if (wikitext) {
		sectionLinkRefCache.set(cacheKey, parseWikiLinkRefs(wikitext));
	}
	return plain;
}

export async function ensureSectionLinkRefs(
	post: Post,
	sectionIndex: number,
	settingsWikiLang: string
): Promise<WikiLinkRef[]> {
	if (!post?.title) return [];
	if (sectionIndex === 0) return ensureSummaryLinkRefs(post, settingsWikiLang);

	const cacheKey = `${settingsWikiLang}:${post.title}:${sectionIndex}`;
	if (sectionLinkRefCache.has(cacheKey)) {
		return sectionLinkRefCache.get(cacheKey) || [];
	}

	try {
		const data = (await wikiQuery(
			{
				action: "parse",
				page: post.title,
				prop: "wikitext",
				section: sectionIndex,
				disablelimitreport: 1
			},
			{ settingsWikiLang }
		)) as MwQueryData;
		const refs = parseWikiLinkRefs(data?.parse?.wikitext?.["*"] || "");
		sectionLinkRefCache.set(cacheKey, refs);
		return refs;
	} catch {
		sectionLinkRefCache.set(cacheKey, []);
		return [];
	}
}

export async function ensureSummaryLinkRefs(
	post: Post,
	settingsWikiLang: string
): Promise<WikiLinkRef[]> {
	if (!post?.title) return [];
	if (post._summaryLinkRefs) return post._summaryLinkRefs;
	const cacheKey = `${settingsWikiLang}:${post.title}`;
	if (summaryLinkRefCache.has(cacheKey)) {
		post._summaryLinkRefs = summaryLinkRefCache.get(cacheKey);
		return post._summaryLinkRefs ?? [];
	}

	let wikitext = "";
	try {
		const data = (await wikiQuery(
			{
				action: "parse",
				page: post.title,
				prop: "wikitext",
				section: 0,
				disablelimitreport: 1
			},
			{ settingsWikiLang }
		)) as MwQueryData;
		wikitext = data?.parse?.wikitext?.["*"] || "";
	} catch {
		wikitext = "";
	}
	if (!wikitext) {
		try {
			const data = (await wikiQuery(
				{
					action: "parse",
					page: post.title,
					prop: "wikitext",
					disablelimitreport: 1
				},
				{ settingsWikiLang }
			)) as MwQueryData;
			wikitext = String(data?.parse?.wikitext?.["*"] || "").slice(0, 4000);
		} catch {
			wikitext = "";
		}
	}
	const refs = parseWikiLinkRefs(wikitext);
	post._summaryLinkRefs = refs;
	summaryLinkRefCache.set(cacheKey, refs);
	return refs;
}

export function markPostSeen(post: Post, engagement: EngagementDeps): void {
	post.seen = (post.seen ?? 0) + 1;
	engagement.seenPosts.push(post.id);
	const timeSpent = Math.min(10000, Date.now() - engagement.lastSpentTime);
	engagement.lastSpentTime = Date.now();
	engagement.timeSpentTotal += timeSpent;
	engagement.timeSpentSession += timeSpent;
	engagement.postsWithoutLike++;
}

export function categoryTitleFromKey(key: string | null | undefined): string | null {
	const raw = String(key || "")
		.replace(/^Category:/i, "")
		.trim();
	if (!raw) return null;
	return `Category:${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
}

function pageImageFile(page: MwPage): string {
	if (page?.pageimage) return normalizeFileTitle(page.pageimage);
	return "";
}

export function apiPageToPost(
	apiPage: MwPage | null | undefined,
	settingsWikiLang: string,
	topicNoiseRe: RegExp[] = []
): Post | null {
	if (!apiPage || apiPage.missing != null || apiPage.invalid != null) return null;
	if (apiPage.pageprops?.disambiguation != null) return null;
	const extract = (apiPage.extract || "").replace(/\s+/g, " ").trim();
	if (!extract || extract.length < 20) return null;
	if (!apiPage.pageid || !apiPage.title) return null;
	const categories = (apiPage.categories || [])
		.map((c) => (c.title || "").replace(/^Category:/i, "").toLowerCase())
		.filter(Boolean);
	const linkTitles = (apiPage.links || [])
		.map((l) => l.title)
		.filter((t): t is string => !!t);
	const thumb = pageImageFile(apiPage) || "";
	const post: Post = {
		title: apiPage.title,
		id: apiPage.pageid,
		wikiLang: settingsWikiLang || "simple",
		text: extract.slice(0, 600),
		thumb: thumb || null,
		categories,
		links: [],
		linkTitles,
		images: thumb ? [thumb] : [],
		allCategories: buildAllCategories(categories, apiPage.pageid, [], topicNoiseRe),
		seen: 0,
		aliases: [apiPage.title]
	};
	return cachePage(post) ?? null;
}

async function wikiQueryForSettings(
	params: WikiParams,
	settings: Settings,
	opts: { useCache?: boolean; lang?: string } = {}
): Promise<unknown> {
	return wikiQuery(params, {
		...opts,
		settingsWikiLang: settings.wikiLang || "simple"
	});
}

export async function hydrateByTitles(
	titles: string[],
	settings: Settings,
	topicNoiseRe: RegExp[] = []
): Promise<Post[]> {
	const unique = [...new Set((titles || []).filter(Boolean))];
	if (!unique.length) return [];
	const out: Post[] = [];
	for (let i = 0; i < unique.length; i += 10) {
		const batch = unique.slice(i, i + 10);
		try {
			const data = (await wikiQueryForSettings(
				{
					action: "query",
					redirects: 1,
					titles: batch.join("|"),
					prop: "extracts|categories|pageimages|links|pageprops|info",
					exintro: 1,
					explaintext: 1,
					exchars: 600,
					cllimit: 20,
					plnamespace: 0,
					pllimit: 50,
					piprop: "thumbnail|name",
					pithumbsize: 720,
					ppprop: "disambiguation"
				},
				settings
			)) as MwQueryData;
			const pages = Object.values(data?.query?.pages || {});
			for (const page of pages) {
				const post = apiPageToPost(
					page,
					settings.wikiLang || "simple",
					topicNoiseRe
				);
				if (post) out.push(post);
			}
		} catch (err) {
			console.warn("hydrateByTitles failed", err);
		}
	}
	await resolvePostLinks(out, settings, topicNoiseRe);
	return out;
}

export async function hydrateByPageIds(
	ids: Array<number | string>,
	settings: Settings,
	topicNoiseRe: RegExp[] = []
): Promise<Post[]> {
	const unique = [...new Set((ids || []).map(Number).filter(Boolean))];
	if (!unique.length) return [];
	const out: Post[] = [];
	for (let i = 0; i < unique.length; i += 10) {
		const batch = unique.slice(i, i + 10);
		try {
			const data = (await wikiQueryForSettings(
				{
					action: "query",
					redirects: 1,
					pageids: batch.join("|"),
					prop: "extracts|categories|pageimages|links|pageprops|info",
					exintro: 1,
					explaintext: 1,
					exchars: 600,
					cllimit: 20,
					plnamespace: 0,
					pllimit: 50,
					piprop: "thumbnail|name",
					pithumbsize: 720,
					ppprop: "disambiguation"
				},
				settings
			)) as MwQueryData;
			for (const page of Object.values(data?.query?.pages || {})) {
				const post = apiPageToPost(
					page,
					settings.wikiLang || "simple",
					topicNoiseRe
				);
				if (post) out.push(post);
			}
		} catch (err) {
			console.warn("hydrateByPageIds failed", err);
		}
	}
	await resolvePostLinks(out, settings, topicNoiseRe);
	return out;
}

export async function resolvePostLinks(
	posts: Post[],
	settings: Settings,
	topicNoiseRe: RegExp[] = []
): Promise<void> {
	// Some generator queries omit links; backfill from a titles query when needed.
	const needLinks = posts.filter((p) => !(p.linkTitles || []).length && p.title);
	for (let i = 0; i < needLinks.length; i += 10) {
		const batch = needLinks.slice(i, i + 10);
		try {
			const data = (await wikiQueryForSettings(
				{
					action: "query",
					redirects: 1,
					titles: batch.map((p) => p.title).join("|"),
					prop: "links",
					plnamespace: 0,
					pllimit: 50
				},
				settings
			)) as MwQueryData;
			const byTitle = new Map(
				Object.values(data?.query?.pages || {}).map((p) => [p.title || "", p])
			);
			for (const post of batch) {
				const page = byTitle.get(post.title);
				if (page?.links?.length)
					post.linkTitles = page.links
						.map((l) => l.title)
						.filter((t): t is string => !!t);
			}
		} catch (err) {
			console.warn("link backfill failed", err);
		}
	}

	const titles: string[] = [];
	for (const post of posts) {
		(post.linkTitles || []).forEach((t) => titles.push(t));
	}
	const unique = [...new Set(titles)].slice(0, 120);
	if (!unique.length) return;
	const titleToId = new Map<string, number>();
	for (let i = 0; i < unique.length; i += 20) {
		const batch = unique.slice(i, i + 20);
		try {
			const data = (await wikiQueryForSettings(
				{
					action: "query",
					redirects: 1,
					titles: batch.join("|"),
					prop: "info|pageimages",
					piprop: "name",
					pithumbsize: 720
				},
				settings
			)) as MwQueryData;
			const { resolve } = indexQueryPages(data);
			for (const title of batch) {
				const page = resolve(title);
				if (page) titleToId.set(title, page.id);
			}
		} catch (err) {
			console.warn("resolvePostLinks failed", err);
		}
	}
	for (const post of posts) {
		const ids: number[] = [];
		for (const title of post.linkTitles || []) {
			const id = titleToId.get(title) || getPageByTitle(title)?.id;
			if (id) ids.push(id);
		}
		post.links = ids;
		post.allCategories = buildAllCategories(
			post.categories,
			post.id,
			ids,
			topicNoiseRe
		);
		cachePage(post);
	}
}

export function findRelatedInSummary(
	post: Post,
	opts?: { spokenText?: string; linkRefs?: WikiLinkRef[] }
): RelatedInSummary[] {
	const text = String(opts?.spokenText ?? post?.text ?? "").toLowerCase();
	if (!text || !post) return [];
	const out: RelatedInSummary[] = [];
	const seenIds = new Set<number>();

	const mentionInText = (
		page: Post | null | undefined,
		preferredLabel: string | null
	): string | null => {
		const candidates = [preferredLabel, page?.title, ...(page?.aliases || [])].filter(
			(n): n is string => !!n
		);
		// Prefer longer phrases so "Spanish Cup" wins over a stray short alias.
		candidates.sort((a, b) => String(b).length - String(a).length);
		return candidates.find((n) => text.includes(String(n).toLowerCase())) || null;
	};

	const push = (page: Post | null | undefined, preferredLabel: string | null) => {
		if (!page?.id || page.id === post.id || seenIds.has(page.id)) return;
		const label = mentionInText(page, preferredLabel);
		if (!label) return;
		seenIds.add(page.id);
		out.push({ id: page.id, page, title: page.title, label });
	};

	const refs = opts?.linkRefs ?? post._summaryLinkRefs ?? [];
	// Lead/section wikitext refs first — labels match spoken extract (piped links).
	for (const ref of refs) {
		if (!text.includes(String(ref.label).toLowerCase())) continue;
		const page = getPageByTitle(ref.target);
		if (page) push(page, ref.label);
	}

	// Fallback: resolved outgoing links whose title/alias appears in the extract.
	for (const id of post.links || []) push(getPageById(id), null);

	return out.slice(0, RELATED_LINK_CAP);
}

export async function prefetchRelatedThumbs(
	post: Post,
	settings: Settings
): Promise<RelatedInSummary[]> {
	if (!post) return [];
	await ensureSummaryLinkRefs(post, settings.wikiLang || "simple");

	// Resolve intro link targets (including piped-label destinations) + fill thumbs.
	const refTargets = (post._summaryLinkRefs || []).map((r) => r.target);
	const needTitles = [...new Set([...refTargets, ...(post.linkTitles || [])])]
		.filter((t) => {
			const page = getPageByTitle(t);
			return !page || !page.thumb;
		})
		.slice(0, 40);

	for (let i = 0; i < needTitles.length; i += 20) {
		const batch = needTitles.slice(i, i + 20);
		try {
			const data = (await wikiQueryForSettings(
				{
					action: "query",
					redirects: 1,
					titles: batch.join("|"),
					prop: "pageimages|info",
					piprop: "thumbnail|name",
					pithumbsize: 720
				},
				settings
			)) as MwQueryData;
			const { resolve } = indexQueryPages(data);
			for (const title of batch) resolve(title);
		} catch (err) {
			console.warn("prefetchRelatedThumbs failed", err);
		}
	}

	const related = findRelatedInSummary(post);
	post._relatedInSummary = related;
	return related;
}

/** Prefetch thumbs for links in a chosen section and return related matches for that spoken text. */
export async function prefetchRelatedForSection(
	post: Post,
	settings: Settings,
	sectionIndex: number,
	spokenText: string
): Promise<RelatedInSummary[]> {
	if (!post) return [];
	const lang = settings.wikiLang || "simple";
	const refs = await ensureSectionLinkRefs(post, sectionIndex, lang);
	const refTargets = refs.map((r) => r.target);
	const needTitles = [...new Set([...refTargets, ...(post.linkTitles || [])])]
		.filter((t) => {
			const page = getPageByTitle(t);
			return !page || !page.thumb;
		})
		.slice(0, 40);

	for (let i = 0; i < needTitles.length; i += 20) {
		const batch = needTitles.slice(i, i + 20);
		try {
			const data = (await wikiQueryForSettings(
				{
					action: "query",
					redirects: 1,
					titles: batch.join("|"),
					prop: "pageimages|info",
					piprop: "thumbnail|name",
					pithumbsize: 720
				},
				settings
			)) as MwQueryData;
			const { resolve } = indexQueryPages(data);
			for (const title of batch) resolve(title);
		} catch (err) {
			console.warn("prefetchRelatedForSection failed", err);
		}
	}

	return findRelatedInSummary(post, { spokenText, linkRefs: refs });
}

export async function fetchRandomCandidates(
	settings: Settings,
	topicNoiseRe: RegExp[] = [],
	limit = 8
): Promise<Post[]> {
	try {
		const data = (await wikiQueryForSettings(
			{
				action: "query",
				generator: "random",
				grnnamespace: 0,
				grnlimit: limit,
				prop: "extracts|categories|pageimages|links|pageprops|info",
				exintro: 1,
				explaintext: 1,
				exchars: 600,
				cllimit: 20,
				plnamespace: 0,
				pllimit: 50,
				piprop: "thumbnail|name",
				pithumbsize: 720,
				ppprop: "disambiguation"
			},
			settings,
			{ useCache: false }
		)) as MwQueryData;
		const posts = Object.values(data?.query?.pages || {})
			.map((p) => apiPageToPost(p, settings.wikiLang || "simple", topicNoiseRe))
			.filter((p): p is Post => !!p);
		await resolvePostLinks(posts, settings, topicNoiseRe);
		return posts;
	} catch (err) {
		console.warn("fetchRandomCandidates failed", err);
		return [];
	}
}

export async function fetchCategoryCandidates(
	categoryKey: string,
	settings: Settings,
	topicNoiseRe: RegExp[] = [],
	limit = 8
): Promise<Post[]> {
	const gcmTitle = categoryTitleFromKey(categoryKey);
	if (!gcmTitle) return [];
	try {
		const data = (await wikiQueryForSettings(
			{
				action: "query",
				generator: "categorymembers",
				gcmtitle: gcmTitle,
				gcmnamespace: 0,
				gcmlimit: limit,
				gcmtype: "page",
				prop: "extracts|categories|pageimages|links|pageprops|info",
				exintro: 1,
				explaintext: 1,
				exchars: 600,
				cllimit: 20,
				plnamespace: 0,
				pllimit: 50,
				piprop: "thumbnail|name",
				pithumbsize: 720,
				ppprop: "disambiguation"
			},
			settings,
			{ useCache: false }
		)) as MwQueryData;
		const posts = Object.values(data?.query?.pages || {})
			.map((p) => apiPageToPost(p, settings.wikiLang || "simple", topicNoiseRe))
			.filter((p): p is Post => !!p);
		await resolvePostLinks(posts, settings, topicNoiseRe);
		return posts;
	} catch {
		return [];
	}
}

export function topInterestCategories(
	categoryScores: Record<string, number>,
	topicNoiseRe: RegExp[],
	limit = 5
): string[] {
	return Object.entries(categoryScores)
		.filter(
			([cat, score]) =>
				!String(cat).startsWith("p:") &&
				!isNoiseTopic(cat, topicNoiseRe) &&
				Number(score) > 0
		)
		.sort((a, b) => Number(b[1]) - Number(a[1]))
		.slice(0, limit)
		.map(([cat]) => cat);
}

export function scoreCandidate(
	post: Post,
	deps: {
		categoryScores: Record<string, number>;
		likedPosts: number[];
		dislikedPosts: number[];
		topicNoiseRe?: RegExp[];
	}
): number {
	const initialScore =
		(post.thumb ? 5 : 0) +
		(3 ** (post.seen ?? 0) - 1) * -50000 +
		(deps.dislikedPosts.includes(post.id) ? -100000 : 0) +
		(deps.likedPosts.includes(post.id) ? 25 : 0);
	const cats =
		post.allCategories ||
		buildAllCategories(post.categories, post.id, post.links, deps.topicNoiseRe || []);
	return [...cats].reduce(
		(sum, cat) => sum + (deps.categoryScores[cat] ?? 0),
		initialScore
	);
}

export function pickScoredPost(
	potentialPosts: Post[],
	deps: {
		categoryScores: Record<string, number>;
		likedPosts: number[];
		dislikedPosts: number[];
		topicNoiseRe?: RegExp[];
	}
): Post | null {
	if (!potentialPosts.length) return null;
	potentialPosts.forEach((post) => {
		post.score = scoreCandidate(post, deps);
	});
	const pool = [...potentialPosts];
	let bestPost = pool[0];
	if (Math.random() < 0.4) {
		const minScore = Math.min(...pool.map((e) => e.score ?? 0));
		const maxScore =
			pool.reduce((sum, post) => sum + (post.score ?? 0) - minScore, 0) || 1;
		const targetScore = Math.random() * maxScore;
		let scoreCount = 0;
		const working = [...pool];
		while (scoreCount < targetScore && working.length) {
			const potentialPost = working.pop()!;
			bestPost = potentialPost;
			scoreCount += (potentialPost.score ?? 0) - minScore;
		}
	} else if (Math.random() > 0.3) {
		let highestScore = -Infinity;
		pool.forEach((post) => {
			if ((post.score ?? 0) > highestScore) {
				bestPost = post;
				highestScore = post.score ?? 0;
			}
		});
	} else {
		bestPost = pool[Math.floor(Math.random() * pool.length)];
	}
	return bestPost;
}

export async function refillCandidatePool(deps: WikiFeedDeps): Promise<void> {
	const queue = deps.getCandidateQueue();
	const settings = deps.getSettings();
	const engagement = deps.getEngagement();
	const topicNoiseRe = deps.getTopicNoiseRe();
	const scoreDeps = {
		categoryScores: engagement.categoryScores,
		likedPosts: engagement.likedPosts,
		dislikedPosts: engagement.dislikedPosts,
		topicNoiseRe
	};

	const need = Math.max(0, PREFETCH_AHEAD + 2 - queue.length);
	if (need <= 0) return;
	const gathered: Post[] = [];
	const roll = Math.random();
	if (roll < 0.5) {
		const cats = topInterestCategories(engagement.categoryScores, topicNoiseRe, 5);
		if (cats.length) {
			const cat = cats[Math.floor(Math.random() * cats.length)];
			gathered.push(
				...(await fetchCategoryCandidates(
					cat,
					settings,
					topicNoiseRe,
					Math.min(10, need + 2)
				))
			);
		}
	}
	if ((roll >= 0.5 && roll < 0.8) || gathered.length < need) {
		gathered.push(
			...(await fetchRandomCandidates(
				settings,
				topicNoiseRe,
				Math.min(10, need + 2)
			))
		);
	}
	if (roll >= 0.8 || gathered.length < need) {
		const likedIds = engagement.likedPosts.slice(-8);
		const linkTitles: string[] = [];
		for (const id of likedIds) {
			const page = getPageById(id);
			(page?.linkTitles || []).forEach((t) => linkTitles.push(t));
			(page?.links || []).forEach((lid) => {
				const linked = getPageById(lid);
				if (linked?.title) linkTitles.push(linked.title);
			});
		}
		if (linkTitles.length)
			gathered.push(
				...(await hydrateByTitles(
					linkTitles.sort(() => Math.random() - 0.5).slice(0, need + 2),
					settings,
					topicNoiseRe
				))
			);
	}
	if (!gathered.length)
		gathered.push(...(await fetchRandomCandidates(settings, topicNoiseRe, need + 2)));

	const queuedIds = new Set(queue.map((p) => p.id));
	const visibleIds = new Set(deps.getVisiblePostIds());
	const fresh = gathered.filter(
		(p) => p && !queuedIds.has(p.id) && !visibleIds.has(p.id)
	);
	while (queue.length < PREFETCH_AHEAD + 2 && fresh.length) {
		const pick = pickScoredPost(fresh, scoreDeps);
		if (!pick) break;
		const idx = fresh.findIndex((p) => p.id === pick.id);
		if (idx >= 0) fresh.splice(idx, 1);
		queue.push(pick);
		queuedIds.add(pick.id);
	}
}

export async function getNextPost(deps: WikiFeedDeps): Promise<Post | null> {
	const queue = deps.getCandidateQueue();
	const settings = deps.getSettings();
	const engagement = deps.getEngagement();
	const topicNoiseRe = deps.getTopicNoiseRe();

	if (queue.length < 2) await refillCandidatePool(deps);
	let post = queue.shift();
	if (!post) {
		await refillCandidatePool(deps);
		post = queue.shift();
	}
	if (!post) return null;
	if (!post.text || post.text.length < 20) {
		const hydrated = await hydrateByPageIds([post.id], settings, topicNoiseRe);
		post = hydrated[0] || post;
	}
	await prefetchRelatedThumbs(post, settings);
	markPostSeen(post, engagement);
	cachePage(post);
	return post;
}

export function engagePost(
	post: Post | null | undefined,
	amount: number,
	categoryScores: Record<string, number>,
	topicNoiseRe: RegExp[] = []
): number {
	if (!post) return 0;
	const applied = Number(amount) || 0;
	for (const category of post.allCategories ||
		buildAllCategories(post.categories, post.id, post.links, topicNoiseRe))
		categoryScores[category] = (categoryScores[category] || 0) + applied;
	return applied;
}

export function getArticleLink(
	title: string | null | undefined,
	settings: Settings,
	forceCurrentWiki = false
): string {
	const lang = forceCurrentWiki || !settings.openMainWiki ? settings.wikiLang : "en";
	return `https://${wikiSiteHost(lang, settings.wikiLang)}/wiki/${encodeURIComponent(String(title || "").replace(/ /g, "_"))}`;
}

export async function shareArticle(
	post: Post,
	wikiLanguages: WikiLang[],
	settings: Settings
): Promise<"shared" | "copied" | "aborted" | "failed"> {
	const payload = {
		title: post.title,
		text: post.text,
		url: postUrl(post, wikiLanguages, settings.wikiLang || "simple")
	};
	try {
		if (navigator.share) {
			await navigator.share(payload);
			return "shared";
		}
		if (navigator.clipboard) {
			await navigator.clipboard.writeText(payload.url);
			return "copied";
		}
		return "failed";
	} catch (error) {
		const err = error as { name?: string };
		if (err?.name === "AbortError") return "aborted";
		console.warn("Could not share article", error);
		return "failed";
	}
}

export function resolveLinkTitle(pageId: number | string): string {
	return getPageById(pageId)?.title || "";
}

export { convertCat };
export { WIKI_CACHE_MAX, WIKI_MAX_CONCURRENT, WIKI_USER_AGENT };
