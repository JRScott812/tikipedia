import { wikiQuery } from "./wiki";

/**
 * Fetches the lead image for a topic group's representative Wikipedia page
 * (e.g. the "Film" article's thumbnail for the Film & TV account), used as
 * that account's pfp instead of a generic app/Wikipedia logo.
 */

interface ThumbPage {
	thumbnail?: { source?: string };
}

interface ThumbQueryData {
	query?: { pages?: Record<string, ThumbPage> };
}

const iconCache = new Map<string, Promise<string | null>>();

export function fetchTopicIcon(
	wikiPage: string,
	lang: string | null | undefined
): Promise<string | null> {
	const clean = String(wikiPage || "").trim();
	if (!clean) return Promise.resolve(null);
	const wikiLang = lang || "simple";
	const key = `${wikiLang}|${clean.toLowerCase()}`;
	const cached = iconCache.get(key);
	if (cached) return cached;

	const promise = (async () => {
		try {
			const data = (await wikiQuery(
				{
					action: "query",
					redirects: 1,
					titles: clean,
					prop: "pageimages",
					piprop: "thumbnail",
					pithumbsize: 200
				},
				{ lang: wikiLang, settingsWikiLang: wikiLang }
			)) as ThumbQueryData;
			const page = Object.values(data?.query?.pages || {})[0];
			return page?.thumbnail?.source || null;
		} catch {
			return null;
		}
	})();

	iconCache.set(key, promise);
	return promise;
}
