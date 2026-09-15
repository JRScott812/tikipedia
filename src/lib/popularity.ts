/**
 * Article popularity via the Wikimedia Pageviews REST API — used to rank an
 * account's (topic's) shorts by how widely-read the underlying article is.
 * https://wikimedia.org/api/rest_v1/#/Pageviews%20data
 */
const PAGEVIEWS_MAX_CONCURRENT = 4;
const pageviewsCache = new Map<string, Promise<number>>();

function yyyymmdd(date: Date): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	return `${y}${m}${d}00`;
}

interface PageviewsItem {
	views?: number;
}

/** Total pageviews over the last `daysBack` days for one article (0 on any failure). */
export async function fetchArticlePageviews(
	title: string,
	lang: string | null | undefined,
	daysBack = 60
): Promise<number> {
	const clean = String(title || "").trim();
	if (!clean) return 0;
	const project = `${lang || "simple"}.wikipedia`;
	const cacheKey = `${project}|${daysBack}|${clean.toLowerCase()}`;
	const cached = pageviewsCache.get(cacheKey);
	if (cached) return cached;

	const promise = (async () => {
		try {
			const end = new Date();
			const start = new Date(end);
			start.setUTCDate(start.getUTCDate() - daysBack);
			const article = encodeURIComponent(clean.replace(/ /g, "_"));
			const url =
				`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
				`${project}/all-access/all-agents/${article}/monthly/` +
				`${yyyymmdd(start)}/${yyyymmdd(end)}`;
			const res = await fetch(url);
			if (!res.ok) return 0;
			const data = (await res.json()) as { items?: PageviewsItem[] };
			return (data.items || []).reduce((sum, item) => sum + (item.views || 0), 0);
		} catch {
			return 0;
		}
	})();

	pageviewsCache.set(cacheKey, promise);
	return promise;
}

/** Days back to the earliest date the Pageviews API has data for (2015-07-01). */
const LIFETIME_DAYS = Math.ceil(
	(Date.now() - Date.UTC(2015, 6, 1)) / (24 * 60 * 60 * 1000)
);

/** Lifetime (since mid-2015) pageviews for one article — shown on the feed as "views". */
export function fetchArticleLifetimeViews(
	title: string,
	lang: string | null | undefined
): Promise<number> {
	return fetchArticlePageviews(title, lang, LIFETIME_DAYS);
}

/** Rank items by real Wikipedia pageviews, most-viewed first (concurrency-limited). */
export async function rankByPageviews<T>(
	items: T[],
	getTitle: (item: T) => string,
	lang: string | null | undefined
): Promise<Array<T & { views: number }>> {
	const results: Array<T & { views: number }> = new Array(items.length) as Array<
		T & { views: number }
	>;
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min(PAGEVIEWS_MAX_CONCURRENT, items.length) },
		async () => {
			for (;;) {
				const i = cursor++;
				if (i >= items.length) return;
				const item = items[i]!;
				const views = await fetchArticlePageviews(getTitle(item), lang);
				results[i] = Object.assign({}, item, { views });
			}
		}
	);
	await Promise.all(workers);
	return results.sort((a, b) => b.views - a.views);
}
