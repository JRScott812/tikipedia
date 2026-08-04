import { BASE_PATH } from "./path";
import type { Post, PostRoute, WikiLang } from "../types/wiki";

export type LocationLike = Pick<Location, "pathname" | "search" | "hash" | "origin">;

/** Wikipedia-style slug: spaces → underscores, then URI-encode. */
export function titleToSlug(title: string | null | undefined): string {
	const raw = String(title || "")
		.trim()
		.replace(/\s+/g, "_");
	if (!raw) return "";
	return encodeURIComponent(raw);
}

export function slugToTitle(slug: string | null | undefined): string {
	if (!slug) return "";
	try {
		return decodeURIComponent(String(slug)).replace(/_/g, " ").trim();
	} catch {
		return String(slug).replace(/_/g, " ").trim();
	}
}

export function isWikiLangCode(
	code: string | null | undefined,
	wikiLanguages: WikiLang[]
): boolean {
	const c = String(code || "").toLowerCase();
	if (!c) return false;
	return wikiLanguages.some((l) => l.code === c);
}

export function normalizeWikiLang(
	code: string | null | undefined,
	wikiLanguages: WikiLang[],
	fallbackLang = "simple"
): string {
	const c = String(code || "").toLowerCase();
	if (isWikiLangCode(c, wikiLanguages)) return c;
	return fallbackLang || "simple";
}

function ensureTrailingSlash(base: string): string {
	return base.endsWith("/") ? base : `${base}/`;
}

/** Canonical post path: /p/{lang}/{slug} */
export function postPathForRoute(
	opts: { lang?: string | null; slug?: string | null } = {},
	wikiLanguages: WikiLang[],
	fallbackLang = "simple",
	base: string = BASE_PATH
): string {
	const baseSlash = ensureTrailingSlash(base);
	const l = normalizeWikiLang(opts.lang, wikiLanguages, fallbackLang);
	const s = opts.slug || "";
	if (!s) return `${baseSlash}p/${l}/`;
	return `${baseSlash}p/${l}/${s}`;
}

/** @deprecated use postPathForRoute — kept for call sites that only have a slug */
export function postPathForSlug(
	slug: string,
	lang: string | null | undefined,
	wikiLanguages: WikiLang[],
	fallbackLang = "simple",
	base: string = BASE_PATH
): string {
	return postPathForRoute({ lang, slug }, wikiLanguages, fallbackLang, base);
}

export function postUrl(
	post: Post | null | undefined,
	wikiLanguages: WikiLang[],
	fallbackLang = "simple",
	loc: LocationLike = location,
	base: string = BASE_PATH
): string {
	const slug = titleToSlug(post?.title);
	if (!slug) return `${loc.origin}${base}`;
	const lang = post?.wikiLang || fallbackLang;
	return `${loc.origin}${postPathForRoute({ lang, slug }, wikiLanguages, fallbackLang, base)}`;
}

/**
 * Read post route from path (/p/{lang}/{slug} or legacy /p/{slug}),
 * hash (#/p/…), or ?p= / ?lang=.
 */
export function readPostRouteFromLocation(
	wikiLanguages: WikiLang[],
	loc: LocationLike = location,
	base: string = BASE_PATH
): PostRoute {
	const baseSlash = ensureTrailingSlash(base);
	const path = loc.pathname || "";
	const prefix = `${baseSlash}p/`;
	const langParam = new URLSearchParams(loc.search).get("lang");

	const fromParts = (parts: string[]): PostRoute => {
		const segs = (parts || []).filter(Boolean);
		if (!segs.length) return { lang: null, slug: "" };
		if (segs.length >= 2 && isWikiLangCode(segs[0], wikiLanguages))
			return { lang: segs[0].toLowerCase(), slug: segs.slice(1).join("/") };
		return { lang: null, slug: segs[0] };
	};

	if (path.startsWith(prefix)) {
		const rest = path.slice(prefix.length).replace(/\/+$/, "");
		const route = fromParts(rest.split("/"));
		if (route.slug) {
			if (!route.lang && langParam && isWikiLangCode(langParam, wikiLanguages))
				route.lang = langParam.toLowerCase();
			return route;
		}
	}

	const hash = (loc.hash || "").replace(/^#\/?/, "");
	const hashBody = hash.replace(/^p\//i, "");
	if (hashBody && hashBody !== "p") {
		const route = fromParts(hashBody.split("/"));
		if (route.slug) {
			if (!route.lang && langParam && isWikiLangCode(langParam, wikiLanguages))
				route.lang = langParam.toLowerCase();
			return route;
		}
	}

	const q = new URLSearchParams(loc.search).get("p");
	if (q) {
		const decoded = (() => {
			try {
				return decodeURIComponent(q);
			} catch {
				return q;
			}
		})();
		if (decoded.includes("/")) {
			const route = fromParts(decoded.split("/"));
			if (route.slug) return route;
		}
		const slug =
			titleToSlug(slugToTitle(q)) ||
			encodeURIComponent(String(q).replace(/\s+/g, "_"));
		const lang =
			langParam && isWikiLangCode(langParam, wikiLanguages)
				? langParam.toLowerCase()
				: null;
		return { lang, slug };
	}
	return { lang: null, slug: "" };
}

export function readPostSlugFromLocation(
	wikiLanguages: WikiLang[],
	loc: LocationLike = location,
	base: string = BASE_PATH
): string {
	return readPostRouteFromLocation(wikiLanguages, loc, base).slug;
}

export function appPagePath(
	name: string | null | undefined,
	base: string = BASE_PATH
): string {
	const baseSlash = ensureTrailingSlash(base);
	if (!name || name === "foryou") return baseSlash;
	return `${baseSlash}${name}`;
}

export function readAppPageFromLocation(
	loc: LocationLike = location,
	base: string = BASE_PATH
): string {
	const baseSlash = ensureTrailingSlash(base);
	const path = (loc.pathname || "").replace(/\/+$/, "") || "";
	const baseTrim = baseSlash.replace(/\/+$/, "");
	const rest = path.startsWith(baseTrim)
		? path.slice(baseTrim.length).replace(/^\/+/, "")
		: "";
	const first = rest.split("/")[0];
	if (["profiles", "stats", "settings", "about", "following"].includes(first))
		return first;
	return "";
}

export function appPageDocumentTitle(name: string): string {
	const titles: Record<string, string> = {
		following: "Following",
		profiles: "Profiles",
		stats: "Statistics",
		settings: "Settings",
		about: "About"
	};
	return `${titles[name] || name} — Tikipedia`;
}

export function postDocumentTitle(title: string): string {
	return `${title} — Tikipedia`;
}

export { SITE_TITLE as FEED_DOCUMENT_TITLE } from "./site";
