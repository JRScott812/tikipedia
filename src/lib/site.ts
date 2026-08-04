import site from "../../site.config.json" with { type: "json" };

/** Canonical production origin (GitHub Pages project site). */
export const SITE_ORIGIN = site.origin;
export const SITE_PATH = site.base;
export const SITE_URL = `${SITE_ORIGIN}${SITE_PATH}`;
export const SITE_NAME = "Tikipedia";
export const SITE_TITLE = "Tikipedia — Wikipedia Shorts";
export const SITE_DESCRIPTION =
	"Swipe through Wikipedia as narrated short-form videos with captions — live from Wikimedia, in multiple languages.";
export const SITE_OG_IMAGE = `${SITE_URL}og-image.png`;

function upsertMeta(
	selector: string,
	attrs: Record<string, string>,
	content: string
): void {
	let el = document.head.querySelector(selector) as HTMLMetaElement | null;
	if (!el) {
		el = document.createElement("meta");
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
		document.head.appendChild(el);
	}
	el.setAttribute("content", content);
}

/** Keep share/preview-facing tags aligned with the current client route. */
export function syncDocumentMeta(opts: {
	title: string;
	description?: string;
	path?: string;
	image?: string | null;
}): void {
	const description = opts.description || SITE_DESCRIPTION;
	const path = opts.path ?? `${location.pathname}${location.search}`;
	const url = path.startsWith("http")
		? path
		: new URL(path.replace(/^\//, ""), SITE_URL).href;
	const image = opts.image || SITE_OG_IMAGE;

	document.title = opts.title;

	upsertMeta('meta[name="description"]', { name: "description" }, description);
	upsertMeta('meta[property="og:title"]', { property: "og:title" }, opts.title);
	upsertMeta(
		'meta[property="og:description"]',
		{ property: "og:description" },
		description
	);
	upsertMeta('meta[property="og:url"]', { property: "og:url" }, url);
	upsertMeta('meta[property="og:image"]', { property: "og:image" }, image);
	upsertMeta('meta[name="twitter:title"]', { name: "twitter:title" }, opts.title);
	upsertMeta(
		'meta[name="twitter:description"]',
		{ name: "twitter:description" },
		description
	);
	upsertMeta('meta[name="twitter:image"]', { name: "twitter:image" }, image);

	let canonical = document.head.querySelector(
		'link[rel="canonical"]'
	) as HTMLLinkElement | null;
	if (!canonical) {
		canonical = document.createElement("link");
		canonical.rel = "canonical";
		document.head.appendChild(canonical);
	}
	canonical.href = url;
}
