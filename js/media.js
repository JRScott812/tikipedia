import { state } from "./state.js";
state.normalizeFileTitle = function normalizeFileTitle(name) {
	if (!name) return "";
	let t = String(name).trim();
	t = t.replace(/^\[\[/, "").replace(/\]\]$/, "");
	t = t.split("|")[0].trim();
	t = t.replace(/^File:/i, "").replace(/^Image:/i, "").trim();
	return t.replace(/ /g, "_");
}

state.commonsThumbUrl = function commonsThumbUrl(fileTitle, width = 720) {
	const name = state.normalizeFileTitle(fileTitle);
	if (!name) return "";
	return `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(name)}&width=${width}`;
}

state.isUsefulArticleImage = function isUsefulArticleImage(fileTitle, mime) {
	if (!fileTitle) return false;
	if (mime && !String(mime).startsWith("image/")) return false;
	if (/\.(pdf|djvu|ogg|ogv|oga|webm|mid|midi|wav|mp3|flac|opus)(?:$|\?)/i.test(fileTitle))
		return false;
	if (state.JUNK_IMAGE_RE.test(fileTitle)) return false;
	return true;
}

state.fetchArticleImages = async function fetchArticleImages(title, fallbackThumb, localImages) {
	const cacheKey = `${state.settings.wikiLang}:${title}`;
	if (state.articleImageCache.has(cacheKey))
		return state.articleImageCache.get(cacheKey);

	const seed = [];
	const seen = new Set();
	const pushName = (raw) => {
		const name = state.normalizeFileTitle(raw);
		if (!name || !state.isUsefulArticleImage(name)) return;
		const key = name.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		seed.push(name);
	};
	(localImages || []).forEach(pushName);
	pushName(fallbackThumb);

	const promise = (async () => {
		try {
			const data = await state.wikiQuery({
				action: "query",
				generator: "images",
				titles: title,
				redirects: 1,
				prop: "imageinfo",
				iiprop: "url|mime|size",
				iiurlwidth: 720,
				gimlimit: 50,
			});
			const pages = data?.query?.pages || {};
			const names = [...seed];
			const have = new Set(names.map(n => n.toLowerCase()));
			for (const page of Object.values(pages)) {
				const fileTitle = page.title || "";
				const info = page.imageinfo?.[0];
				const mime = info?.mime || "";
				if (!state.isUsefulArticleImage(fileTitle, mime)) continue;
				const name = state.normalizeFileTitle(fileTitle);
				if (!name || have.has(name.toLowerCase())) continue;
				have.add(name.toLowerCase());
				names.push(name);
			}
			return names.length ? names : seed;
		} catch {
			return seed;
		}
	})();
	state.articleImageCache.set(cacheKey, promise);
	return promise;
}

state.stopImageSlideshow = function stopImageSlideshow(postEl) {
	if (!postEl) return;
	if (postEl._slideTimer) {
		clearInterval(postEl._slideTimer);
		postEl._slideTimer = null;
	}
}

/** Own article images only (excludes related-link thumbs). */
state.ownMediaImages = function ownMediaImages(visual) {
	return [...visual.querySelectorAll("img.media:not([data-link])")];
}

/** Full slideshow pool: article images + referenced-article thumbs. */
state.slideMediaImages = function slideMediaImages(visual) {
	return [...visual.querySelectorAll("img.media")];
}

state.showSlideImage = function showSlideImage(visual, index) {
	const imgs = state.slideMediaImages(visual);
	if (!imgs.length) return 0;
	const i = ((index % imgs.length) + imgs.length) % imgs.length;
	const next = imgs[i];
	// Avoid removing/re-adding data-active on the same image — that retriggers
	// the opacity transition and looks like a flash on single-image posts.
	if (next.dataset.active === "1")
		return i;
	imgs.forEach(img => {
		if (img === next) img.dataset.active = "1";
		else delete img.dataset.active;
	});
	return i;
}

state.ensureLinkedArticleImage = function ensureLinkedArticleImage(visual, page) {
	if (!visual || !page?.thumb) return null;
	let img = visual.querySelector(`img.media[data-link="${page.id}"]`);
	if (img) return img;
	const file = state.normalizeFileTitle(page.thumb);
	if (!file || !state.isUsefulArticleImage(file)) return null;
	const key = file.toLowerCase();
	// Reuse an existing slide with the same file (don't flash a duplicate).
	const existing = visual.querySelector(`img.media[data-file="${key}"]`);
	if (existing) {
		existing.dataset.link = String(page.id);
		return existing;
	}
	img = state.makeMediaImg(state.commonsThumbUrl(file));
	img.dataset.link = String(page.id);
	img.dataset.file = key;
	img._visual = visual;
	visual.appendChild(img);
	return img;
}

state.showLinkedArticleImage = function showLinkedArticleImage(postEl, pageId) {
	if (!postEl) return;
	const visual = postEl.querySelector(".visual");
	if (!visual) return;
	const target = visual.querySelector(`img.media[data-link="${pageId}"]`);
	if (!target) return;
	if (target.dataset.active === "1" && postEl._showingLink === String(pageId))
		return;
	state.stopImageSlideshow(postEl);
	postEl._showingLink = String(pageId);
	const imgs = state.slideMediaImages(visual);
	const idx = imgs.indexOf(target);
	if (idx >= 0) postEl._slideIndex = idx;
	imgs.forEach(img => {
		if (img === target) img.dataset.active = "1";
		else delete img.dataset.active;
	});
}

state.clearLinkedArticleImage = function clearLinkedArticleImage(postEl) {
	if (!postEl || !postEl._showingLink) return;
	postEl._showingLink = null;
	const visual = postEl.querySelector(".visual");
	if (!visual) return;
	const slides = state.slideMediaImages(visual);
	if (slides.length) {
		const i = state.showSlideImage(visual, postEl._slideIndex || 0);
		postEl._slideIndex = i;
	}
	if (state.activePostEl === postEl && !state.playbackPaused && slides.length > 1)
		state.startImageSlideshow(postEl);
}

state.syncCaptionLinkedImage = function syncCaptionLinkedImage(postEl, wordEl) {
	if (!postEl) return;
	const linkId = wordEl?.dataset?.linkId || null;
	if (linkId) {
		if (postEl._showingLink !== String(linkId))
			state.showLinkedArticleImage(postEl, linkId);
		return;
	}
	state.clearLinkedArticleImage(postEl);
}

state.startImageSlideshow = function startImageSlideshow(postEl) {
	if (!postEl) return;
	state.stopImageSlideshow(postEl);
	if (postEl._showingLink) return;
	const visual = postEl.querySelector(".visual");
	if (!visual) return;
	const imgs = state.slideMediaImages(visual);
	if (imgs.length <= 1) {
		if (imgs[0]) state.showSlideImage(visual, 0);
		return;
	}
	let i = state.showSlideImage(visual, postEl._slideIndex || 0);
	postEl._slideTimer = setInterval(() => {
		if (state.playbackPaused && state.activePostEl === postEl) return;
		if (postEl._showingLink) return;
		const live = state.slideMediaImages(visual);
		if (live.length <= 1) {
			state.stopImageSlideshow(postEl);
			if (live[0]) state.showSlideImage(visual, 0);
			return;
		}
		i = state.showSlideImage(visual, (i + 1) % live.length);
		postEl._slideIndex = i;
	}, state.IMAGE_SLIDE_MS);
}

state.makeMediaImg = function makeMediaImg(src) {
	const img = document.createElement("img");
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
		const left = state.slideMediaImages(visual);
		if (left.length && !visual.querySelector("img.media[data-active]"))
			left[0].dataset.active = "1";
	};
	return img;
}

state.hydratePostImages = async function hydratePostImages(postEl, post) {
	const visual = postEl.querySelector(".visual");
	if (!visual) return;
	const names = await state.fetchArticleImages(post.title, post.thumb, post.images);
	post.images = names;
	const existing = new Set(
		[...visual.querySelectorAll("img.media")].map(img => img.dataset.file || "")
	);
	names.forEach((name) => {
		const key = name.toLowerCase();
		if (existing.has(key)) return;
		const img = state.makeMediaImg(state.commonsThumbUrl(name));
		img.dataset.file = key;
		img._visual = visual;
		visual.appendChild(img);
		existing.add(key);
	});
	const related = await state.prefetchRelatedThumbs(post);
	related.forEach(rel => {
		const page = state.getPageById(rel.id) || rel.page;
		if (page) state.ensureLinkedArticleImage(visual, page);
	});
	// Captions were built before async link discovery — retag now that refs exist.
	const caption = postEl.querySelector(".captions");
	if (caption) {
		const spans = [...caption.querySelectorAll(".caption-word")];
		spans.forEach(s => {
			delete s.dataset.linkId;
			delete s.dataset.linkTitle;
			s.classList.remove("caption-link");
		});
		state.tagCaptionLinkWords(spans, post);
	}
	if (!postEl._showingLink)
		state.showSlideImage(visual, postEl._slideIndex || 0);
	if (state.activePostEl === postEl && !postEl._showingLink)
		state.startImageSlideshow(postEl);
}
