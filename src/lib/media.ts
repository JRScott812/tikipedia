/**
 * Article image fetch, junk filtering, Commons thumbs, and slideshow helpers.
 * Pure URL helpers have no DOM deps; PostMediaController accepts element containers.
 */
import { IMAGE_SLIDE_MS, LINK_IMAGE_LOOKAHEAD, LINK_IMAGE_MIN_MS } from "./config";
import { tagCaptionLinkWords } from "./speech";
import type { Post, RelatedInSummary } from "../types/wiki";

export type WikiQueryFn = (
	params: Record<string, string | number | boolean | undefined | null>,
	options?: { useCache?: boolean; lang?: string }
) => Promise<unknown>;

export interface MediaCaches {
	fileThumbUrlCache: Map<string, Promise<string>>;
	articleImageCache: Map<string, Promise<string[]>>;
}

export function createMediaCaches(): MediaCaches {
	return {
		fileThumbUrlCache: new Map(),
		articleImageCache: new Map()
	};
}

/** Default module-level caches (clear via clearMediaCaches). */
export const mediaCaches: MediaCaches = createMediaCaches();

export function clearMediaCaches(caches: MediaCaches = mediaCaches): void {
	caches.fileThumbUrlCache.clear();
	caches.articleImageCache.clear();
}

export function normalizeFileTitle(name: string | null | undefined): string {
	if (!name) return "";
	let t = String(name).trim();
	t = t.replace(/^\[\[/, "").replace(/\]\]$/, "");
	t = t.split("|")[0]!.trim();
	t = t
		.replace(/^File:/i, "")
		.replace(/^Image:/i, "")
		.trim();
	return t.replace(/ /g, "_");
}

export function commonsThumbUrl(fileTitle: string, width = 720): string {
	const name = normalizeFileTitle(fileTitle);
	if (!name) return "";
	return `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(name)}&width=${width}`;
}

export function isUsefulArticleImage(
	fileTitle: string | null | undefined,
	mime: string | null | undefined,
	junkImageRe: RegExp
): boolean {
	if (!fileTitle) return false;
	if (mime && !String(mime).startsWith("image/")) return false;
	if (
		/\.(pdf|djvu|ogg|ogv|oga|webm|mid|midi|wav|mp3|flac|opus)(?:$|\?)/i.test(
			fileTitle
		)
	)
		return false;
	if (junkImageRe.test(fileTitle)) return false;
	return true;
}

interface WikiImageInfo {
	url?: string;
	thumburl?: string;
	mime?: string;
}

interface WikiImagePage {
	title?: string;
	imageinfo?: WikiImageInfo[];
}

function asPagesRecord(data: unknown): Record<string, WikiImagePage> {
	if (!data || typeof data !== "object") return {};
	const query = (data as { query?: { pages?: unknown } }).query;
	if (!query?.pages || typeof query.pages !== "object") return {};
	return query.pages as Record<string, WikiImagePage>;
}

/** Resolve a File: thumb via the current wiki (then Commons), skipping non-images. */
export async function resolveFileThumbUrl(
	fileTitle: string,
	width = 96,
	deps: {
		wikiQuery: WikiQueryFn;
		lang?: string;
		caches?: MediaCaches;
	}
): Promise<string> {
	const name = normalizeFileTitle(fileTitle);
	if (!name) return "";
	if (/\.(webm|ogv|ogg|oga|mid|midi|pdf|djvu)$/i.test(name)) return "";
	const wikiLang = deps.lang || "simple";
	const caches = deps.caches ?? mediaCaches;
	const cacheKey = `${wikiLang}:${width}:${name.toLowerCase()}`;
	if (caches.fileThumbUrlCache.has(cacheKey))
		return caches.fileThumbUrlCache.get(cacheKey)!;

	const promise = (async () => {
		try {
			const data = await deps.wikiQuery(
				{
					action: "query",
					redirects: 1,
					titles: `File:${name.replace(/_/g, " ")}`,
					prop: "imageinfo",
					iiprop: "url|mime",
					iiurlwidth: width
				},
				{ lang: wikiLang }
			);
			const page = Object.values(asPagesRecord(data))[0];
			const info = page?.imageinfo?.[0];
			const mime = info?.mime || "";
			if (info?.thumburl && (!mime || mime.startsWith("image/")))
				return info.thumburl;
			if (info?.url && mime.startsWith("image/")) return info.url;
		} catch {
			/* fall through */
		}
		return commonsThumbUrl(name, width);
	})();

	caches.fileThumbUrlCache.set(cacheKey, promise);
	return promise;
}

export async function fetchArticleImages(
	title: string,
	fallbackThumb: string | null | undefined,
	localImages: string[] | null | undefined,
	deps: {
		wikiQuery: WikiQueryFn;
		lang: string;
		junkImageRe: RegExp;
		caches?: MediaCaches;
	}
): Promise<string[]> {
	const caches = deps.caches ?? mediaCaches;
	const cacheKey = `${deps.lang}:${title}`;
	if (caches.articleImageCache.has(cacheKey))
		return caches.articleImageCache.get(cacheKey)!;

	const seed: string[] = [];
	const seen = new Set<string>();
	const pushName = (raw: string | null | undefined) => {
		const name = normalizeFileTitle(raw);
		if (!name || !isUsefulArticleImage(name, null, deps.junkImageRe)) return;
		const key = name.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		seed.push(name);
	};
	(localImages || []).forEach(pushName);
	pushName(fallbackThumb);

	const promise = (async () => {
		try {
			const data = await deps.wikiQuery({
				action: "query",
				generator: "images",
				titles: title,
				redirects: 1,
				prop: "imageinfo",
				iiprop: "url|mime|size",
				iiurlwidth: 720,
				gimlimit: 50
			});
			const pages = asPagesRecord(data);
			const names = [...seed];
			const have = new Set(names.map((n) => n.toLowerCase()));
			for (const page of Object.values(pages)) {
				const fileTitle = page.title || "";
				const info = page.imageinfo?.[0];
				const mime = info?.mime || "";
				if (!isUsefulArticleImage(fileTitle, mime, deps.junkImageRe)) continue;
				const name = normalizeFileTitle(fileTitle);
				if (!name || have.has(name.toLowerCase())) continue;
				have.add(name.toLowerCase());
				names.push(name);
			}
			return names.length ? names : seed;
		} catch {
			return seed;
		}
	})();

	caches.articleImageCache.set(cacheKey, promise);
	return promise;
}

/** Extended post element fields used by the slideshow. */
export interface PostMediaHost extends HTMLElement {
	_slideTimer?: ReturnType<typeof setInterval> | null;
	_slideIndex?: number;
	_showingLink?: string | null;
	_linkShownAt?: number;
	_linkClearTimer?: ReturnType<typeof setTimeout> | null;
}

export interface MediaImg extends HTMLImageElement {
	_visual?: HTMLElement;
}

export interface PostMediaControllerOptions {
	junkImageRe: RegExp;
	slideMs?: number;
	linkImageMinMs?: number;
	linkLookahead?: number;
	isPlaybackPaused?: () => boolean;
	isActivePost?: (postEl: HTMLElement) => boolean;
	getCaptionWords?: () => HTMLElement[];
}

export class PostMediaController {
	private readonly slideMs: number;
	private readonly linkImageMinMs: number;
	private readonly linkLookahead: number;

	constructor(private readonly opts: PostMediaControllerOptions) {
		this.slideMs = opts.slideMs ?? IMAGE_SLIDE_MS;
		this.linkImageMinMs = opts.linkImageMinMs ?? LINK_IMAGE_MIN_MS;
		this.linkLookahead = opts.linkLookahead ?? LINK_IMAGE_LOOKAHEAD;
	}

	stopImageSlideshow(postEl: HTMLElement | null | undefined): void {
		if (!postEl) return;
		const host = postEl as PostMediaHost;
		if (host._slideTimer) {
			clearInterval(host._slideTimer);
			host._slideTimer = null;
		}
	}

	/** Own article images only (excludes related-link thumbs). */
	ownMediaImages(visual: HTMLElement): HTMLImageElement[] {
		return [
			...visual.querySelectorAll<HTMLImageElement>("img.media:not([data-link])")
		];
	}

	/** Full slideshow pool: article images + referenced-article thumbs. */
	slideMediaImages(visual: HTMLElement): HTMLImageElement[] {
		return [...visual.querySelectorAll<HTMLImageElement>("img.media")];
	}

	showSlideImage(visual: HTMLElement, index: number): number {
		const imgs = this.slideMediaImages(visual);
		if (!imgs.length) return 0;
		const i = ((index % imgs.length) + imgs.length) % imgs.length;
		const next = imgs[i]!;
		// Avoid removing/re-adding data-active on the same image — that retriggers
		// the opacity transition and looks like a flash on single-image posts.
		if (next.dataset.active === "1") return i;
		imgs.forEach((img) => {
			if (img === next) img.dataset.active = "1";
			else delete img.dataset.active;
		});
		return i;
	}

	makeMediaImg(src: string): MediaImg {
		const img = document.createElement("img") as MediaImg;
		img.src = src;
		img.classList.add("media");
		img.alt = "";
		img.draggable = false;
		img.loading = "lazy";
		img.decoding = "async";
		img.onerror = () => {
			img.remove();
			const visual = img._visual;
			if (!visual) return;
			const left = this.slideMediaImages(visual);
			if (left.length && !visual.querySelector("img.media[data-active]"))
				left[0]!.dataset.active = "1";
		};
		return img;
	}

	ensureLinkedArticleImage(
		visual: HTMLElement,
		page: { id: number; thumb?: string | null }
	): HTMLImageElement | null {
		if (!visual || !page?.thumb) return null;
		const existingLink = visual.querySelector<HTMLImageElement>(
			`img.media[data-link="${page.id}"]`
		);
		if (existingLink) return existingLink;
		const file = normalizeFileTitle(page.thumb);
		if (!file || !isUsefulArticleImage(file, null, this.opts.junkImageRe))
			return null;
		const key = file.toLowerCase();
		const existing = visual.querySelector<HTMLImageElement>(
			`img.media[data-file="${key}"]`
		);
		if (existing) {
			existing.dataset.link = String(page.id);
			return existing;
		}
		const created = this.makeMediaImg(commonsThumbUrl(file));
		created.dataset.link = String(page.id);
		created.dataset.file = key;
		created.loading = "eager";
		created._visual = visual;
		visual.appendChild(created);
		return created;
	}

	showLinkedArticleImage(postEl: HTMLElement, pageId: string | number): void {
		const host = postEl as PostMediaHost;
		const visual = postEl.querySelector<HTMLElement>(".visual");
		if (!visual) return;
		const target = visual.querySelector<HTMLImageElement>(
			`img.media[data-link="${pageId}"]`
		);
		if (!target) return;
		if (target.dataset.active === "1" && host._showingLink === String(pageId)) return;
		if (host._linkClearTimer) {
			clearTimeout(host._linkClearTimer);
			host._linkClearTimer = null;
		}
		this.stopImageSlideshow(postEl);
		host._showingLink = String(pageId);
		host._linkShownAt = Date.now();
		target.loading = "eager";
		const imgs = this.slideMediaImages(visual);
		const idx = imgs.indexOf(target);
		if (idx >= 0) host._slideIndex = idx;
		imgs.forEach((img) => {
			if (img === target) img.dataset.active = "1";
			else delete img.dataset.active;
		});
	}

	clearLinkedArticleImage(postEl: HTMLElement): void {
		const host = postEl as PostMediaHost;
		if (!host._showingLink) return;
		if (host._linkClearTimer) {
			clearTimeout(host._linkClearTimer);
			host._linkClearTimer = null;
		}
		host._showingLink = null;
		host._linkShownAt = 0;
		const visual = postEl.querySelector<HTMLElement>(".visual");
		if (!visual) return;
		const slides = this.slideMediaImages(visual);
		if (slides.length) {
			const i = this.showSlideImage(visual, host._slideIndex || 0);
			host._slideIndex = i;
		}
		if (
			this.opts.isActivePost?.(postEl) &&
			!this.opts.isPlaybackPaused?.() &&
			slides.length > 1
		)
			this.startImageSlideshow(postEl);
	}

	/** Keep late-summary link art on screen long enough to read. */
	linkImageRemainingMs(postEl: HTMLElement | null | undefined): number {
		const host = postEl as PostMediaHost | null | undefined;
		if (!host?._showingLink && !host?._linkShownAt) return 0;
		const shownAt = host._linkShownAt || 0;
		if (!shownAt) return this.linkImageMinMs;
		return Math.max(0, this.linkImageMinMs - (Date.now() - shownAt));
	}

	scheduleClearLinkedArticleImage(postEl: HTMLElement): void {
		const host = postEl as PostMediaHost;
		if (!host._showingLink) return;
		if (host._linkClearTimer) {
			clearTimeout(host._linkClearTimer);
			host._linkClearTimer = null;
		}
		const remain = this.linkImageRemainingMs(postEl);
		host._linkClearTimer = setTimeout(() => {
			host._linkClearTimer = null;
			this.clearLinkedArticleImage(postEl);
		}, remain);
	}

	captionLinkIdNear(wordEl: HTMLElement | null | undefined): string | null {
		const direct = wordEl?.dataset?.linkId || null;
		if (direct) return direct;
		const words = this.opts.getCaptionWords?.() || [];
		const idx = wordEl ? words.indexOf(wordEl) : -1;
		if (idx < 0) return null;
		const ahead = this.linkLookahead;
		for (let j = idx + 1; j <= Math.min(idx + ahead, words.length - 1); j++) {
			const id = words[j]?.dataset?.linkId;
			if (id) return id;
		}
		return null;
	}

	syncCaptionLinkedImage(
		postEl: HTMLElement,
		wordEl: HTMLElement | null | undefined
	): void {
		const linkId = this.captionLinkIdNear(wordEl);
		const host = postEl as PostMediaHost;
		if (linkId) {
			if (host._showingLink !== String(linkId))
				this.showLinkedArticleImage(postEl, linkId);
			else if (host._linkClearTimer) {
				clearTimeout(host._linkClearTimer);
				host._linkClearTimer = null;
			}
			return;
		}
		this.scheduleClearLinkedArticleImage(postEl);
	}

	startImageSlideshow(postEl: HTMLElement | null | undefined): void {
		if (!postEl) return;
		this.stopImageSlideshow(postEl);
		const host = postEl as PostMediaHost;
		if (host._showingLink) return;
		const visual = postEl.querySelector<HTMLElement>(".visual");
		if (!visual) return;
		const imgs = this.slideMediaImages(visual);
		if (imgs.length <= 1) {
			if (imgs[0]) this.showSlideImage(visual, 0);
			return;
		}
		let i = this.showSlideImage(visual, host._slideIndex || 0);
		host._slideTimer = setInterval(() => {
			if (this.opts.isPlaybackPaused?.() && this.opts.isActivePost?.(postEl))
				return;
			if (host._showingLink) return;
			const live = this.slideMediaImages(visual);
			if (live.length <= 1) {
				this.stopImageSlideshow(postEl);
				if (live[0]) this.showSlideImage(visual, 0);
				return;
			}
			i = this.showSlideImage(visual, (i + 1) % live.length);
			host._slideIndex = i;
		}, this.slideMs);
	}
}

export function createPostMediaController(
	options: PostMediaControllerOptions
): PostMediaController {
	return new PostMediaController(options);
}

export interface HydratePostImagesDeps {
	wikiQuery: WikiQueryFn;
	lang: string;
	junkImageRe: RegExp;
	caches?: MediaCaches;
	media: PostMediaController;
	prefetchRelatedThumbs: (post: Post) => Promise<RelatedInSummary[]>;
	getPageById: (id: number) => Post | null | undefined;
	isActivePost?: (postEl: HTMLElement) => boolean;
	findRelated?: (post: Post) => RelatedInSummary[];
}

export async function hydratePostImages(
	postEl: HTMLElement,
	post: Post,
	deps: HydratePostImagesDeps
): Promise<void> {
	const visual = postEl.querySelector<HTMLElement>(".visual");
	if (!visual) return;
	const host = postEl as PostMediaHost;
	const names = await fetchArticleImages(post.title, post.thumb, post.images, {
		wikiQuery: deps.wikiQuery,
		lang: deps.lang,
		junkImageRe: deps.junkImageRe,
		caches: deps.caches
	});
	post.images = names;
	const existing = new Set(
		[...visual.querySelectorAll<HTMLImageElement>("img.media")].map(
			(img) => img.dataset.file || ""
		)
	);
	names.forEach((name) => {
		const key = name.toLowerCase();
		if (existing.has(key)) return;
		const img = deps.media.makeMediaImg(commonsThumbUrl(name));
		img.dataset.file = key;
		img._visual = visual;
		visual.appendChild(img);
		existing.add(key);
	});
	const related = await deps.prefetchRelatedThumbs(post);
	related.forEach((rel) => {
		const page = deps.getPageById(rel.id) || rel.page;
		if (page) deps.media.ensureLinkedArticleImage(visual, page);
	});
	// Captions were built before async link discovery — retag now that refs exist.
	const caption = postEl.querySelector(".captions");
	if (caption) {
		const spans = [...caption.querySelectorAll<HTMLSpanElement>(".caption-word")];
		spans.forEach((s) => {
			delete s.dataset.linkId;
			delete s.dataset.linkTitle;
			s.classList.remove("caption-link");
		});
		tagCaptionLinkWords(spans, post, {
			related,
			findRelated: deps.findRelated
		});
	}
	if (!host._showingLink) deps.media.showSlideImage(visual, host._slideIndex || 0);
	if (deps.isActivePost?.(postEl) && !host._showingLink)
		deps.media.startImageSlideshow(postEl);
}
