import { state } from "./state.js";
state.wikiQueryCache = new Map();
state.WIKI_CACHE_MAX = 200;
state.wikiInFlight = 0;
state.wikiWaiters = [];
state.WIKI_MAX_CONCURRENT = 2;

state.wikiCacheKey = function wikiCacheKey(params) {
	return Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
}

state.acquireWikiSlot = function acquireWikiSlot() {
	if (state.wikiInFlight < state.WIKI_MAX_CONCURRENT) {
		state.wikiInFlight++;
		return Promise.resolve();
	}
	return new Promise(resolve => state.wikiWaiters.push(resolve)).then(() => { state.wikiInFlight++; });
}

state.releaseWikiSlot = function releaseWikiSlot() {
	state.wikiInFlight = Math.max(0, state.wikiInFlight - 1);
	const next = state.wikiWaiters.shift();
	if (next) next();
}

state.wikiQuery = async function wikiQuery(params, { useCache = true, lang } = {}) {
	const merged = {
		format: "json",
		origin: "*",
		...params,
	};
	const key = `${lang || state.settings?.wikiLang || "simple"}|${state.wikiCacheKey(merged)}`;
	if (useCache && state.wikiQueryCache.has(key))
		return state.wikiQueryCache.get(key);
	const promise = (async () => {
		await state.acquireWikiSlot();
		try {
			const url = new URL(state.wikiApiBase(lang));
			Object.entries(merged).forEach(([k, v]) => {
				if (v != null && v !== "") url.searchParams.set(k, String(v));
			});
			const res = await fetch(url.toString(), {
				headers: { "Api-User-Agent": "Tikipedia/2.0 (https://github.com/JRScott812/xikipedia; live-feed)" },
			});
			if (!res.ok) throw new Error(`wiki ${res.status}`);
			return await res.json();
		} finally {
			state.releaseWikiSlot();
		}
	})();
	if (useCache) {
		state.wikiQueryCache.set(key, promise);
		if (state.wikiQueryCache.size > state.WIKI_CACHE_MAX) {
			const first = state.wikiQueryCache.keys().next().value;
			state.wikiQueryCache.delete(first);
		}
	}
	try {
		return await promise;
	} catch (err) {
		state.wikiQueryCache.delete(key);
		throw err;
	}
}

state.clearLiveCaches = function clearLiveCaches() {
	state.pageCache.clear();
	state.wikiQueryCache.clear();
	state.articleImageCache.clear();
	state.articleRepCache.clear();
	state.templateMetaCache.clear();
	state.topicIconCache.clear();
	state.summaryLinkRefCache?.clear();
	state.candidateQueue.length = 0;
}

state.cachePage = function cachePage(page) {
	if (!page?.id) return page;
	const prev = state.pageCache.get(page.id);
	if (prev) {
		page.seen = page.seen ?? prev.seen;
		Object.assign(prev, page);
		if (page.allCategories) prev.allCategories = page.allCategories;
		return prev;
	}
	state.pageCache.set(page.id, page);
	return page;
}

state.getPageById = function getPageById(pageId) {
	return state.pageCache.get(Number(pageId)) || state.pageCache.get(String(pageId)) || null;
}

state.getPageByTitle = function getPageByTitle(title) {
	if (!title) return null;
	const needle = title.toLowerCase();
	for (const page of state.pageCache.values()) {
		if (page.title?.toLowerCase() === needle) return page;
		if ((page.aliases || []).some(a => String(a).toLowerCase() === needle)) return page;
	}
	return null;
}

state.addPageAlias = function addPageAlias(page, alias) {
	if (!page || !alias) return;
	const clean = String(alias).replace(/_/g, " ").trim();
	if (!clean) return;
	const aliases = new Set(page.aliases || []);
	aliases.add(clean);
	if (page.title) aliases.add(page.title);
	page.aliases = [...aliases];
}

/** Index pages from a query result, honoring redirects/normalization. */
state.indexQueryPages = function indexQueryPages(data) {
	const redirectTo = new Map();
	for (const r of data?.query?.redirects || [])
		if (r.from && r.to) redirectTo.set(r.from, r.to);
	for (const n of data?.query?.normalized || [])
		if (n.from && n.to) redirectTo.set(n.from, n.to);

	const byTitle = new Map();
	for (const page of Object.values(data?.query?.pages || {})) {
		if (!page.pageid || page.missing != null) continue;
		const prev = state.getPageById(page.pageid);
		const thumb = page.pageimage ? state.normalizeFileTitle(page.pageimage) : (prev?.thumb || null);
		const cached = state.cachePage({
			id: page.pageid,
			title: page.title,
			thumb,
			text: prev?.text || "",
			categories: prev?.categories || [],
			links: prev?.links || [],
			images: prev?.images || (thumb ? [thumb] : []),
			allCategories: prev?.allCategories || state.buildAllCategories([], page.pageid, []),
			seen: prev?.seen || 0,
			aliases: prev?.aliases || [],
		});
		state.addPageAlias(cached, page.title);
		byTitle.set(page.title, cached);
	}

	const resolve = (title) => {
		let t = title;
		const seen = new Set();
		while (redirectTo.has(t) && !seen.has(t)) {
			seen.add(t);
			t = redirectTo.get(t);
		}
		const page = byTitle.get(t) || state.getPageByTitle(t);
		if (page && title !== page.title) state.addPageAlias(page, title);
		return page || null;
	};

	return { resolve, redirectTo, byTitle };
}

/** Pull [[target|label]] refs from lead wikitext so piped labels match spoken text. */
state.parseWikiLinkRefs = function parseWikiLinkRefs(wikitext) {
	const refs = [];
	const seen = new Set();
	const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
	let m;
	while ((m = re.exec(String(wikitext || "")))) {
		let target = m[1].trim().replace(/_/g, " ");
		if (!target || /[:/]/.test(target)) continue; // skip namespaces / interwiki
		const label = (m[2] != null ? m[2] : target).replace(/_/g, " ").replace(/\s+/g, " ").trim();
		if (!label || label.length < 2) continue;
		const key = `${target.toLowerCase()}\0${label.toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		refs.push({ target, label });
	}
	return refs;
}

state.ensureSummaryLinkRefs = async function ensureSummaryLinkRefs(post) {
	if (!post?.title) return [];
	if (post._summaryLinkRefs) return post._summaryLinkRefs;
	const cacheKey = `${state.settings.wikiLang}:${post.title}`;
	if (state.summaryLinkRefCache?.has(cacheKey)) {
		post._summaryLinkRefs = state.summaryLinkRefCache.get(cacheKey);
		return post._summaryLinkRefs;
	}
	if (!state.summaryLinkRefCache) state.summaryLinkRefCache = new Map();

	let wikitext = "";
	try {
		const data = await state.wikiQuery({
			action: "parse",
			page: post.title,
			prop: "wikitext",
			section: 0,
			disablelimitreport: 1,
		});
		wikitext = data?.parse?.wikitext?.["*"] || "";
	} catch {
		wikitext = "";
	}
	if (!wikitext) {
		try {
			const data = await state.wikiQuery({
				action: "parse",
				page: post.title,
				prop: "wikitext",
				disablelimitreport: 1,
			});
			wikitext = String(data?.parse?.wikitext?.["*"] || "").slice(0, 4000);
		} catch {
			wikitext = "";
		}
	}
	const refs = state.parseWikiLinkRefs(wikitext);
	post._summaryLinkRefs = refs;
	state.summaryLinkRefCache.set(cacheKey, refs);
	return refs;
}

state.markPostSeen = function markPostSeen(post) {
	post.seen = (post.seen ?? 0) + 1;
	state.seenPosts.push(post.id);
	const timeSpent = Math.min(10000, Date.now() - state.lastSpentTime);
	state.lastSpentTime = Date.now();
	state.timeSpentTotal += timeSpent;
	state.timeSpentSession += timeSpent;
	state.postsWithoutLike++;
}

state.categoryTitleFromKey = function categoryTitleFromKey(key) {
	const raw = String(key || "").replace(/^Category:/i, "").trim();
	if (!raw) return null;
	return `Category:${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
}

state.pageImageFile = function pageImageFile(page) {
	const name = page?.pageimage || page?.original?.source || "";
	if (page?.pageimage) return state.normalizeFileTitle(page.pageimage);
	return "";
}

state.apiPageToPost = function apiPageToPost(apiPage) {
	if (!apiPage || apiPage.missing != null || apiPage.invalid != null) return null;
	if (apiPage.pageprops?.disambiguation != null) return null;
	const extract = (apiPage.extract || "").replace(/\s+/g, " ").trim();
	if (!extract || extract.length < 20) return null;
	const categories = (apiPage.categories || [])
		.map(c => (c.title || "").replace(/^Category:/i, "").toLowerCase())
		.filter(Boolean);
	const linkTitles = (apiPage.links || []).map(l => l.title).filter(Boolean);
	const thumb = state.pageImageFile(apiPage) || "";
	const post = {
		title: apiPage.title,
		id: apiPage.pageid,
		text: extract.slice(0, 600),
		thumb: thumb || null,
		categories,
		links: [],
		linkTitles,
		images: thumb ? [thumb] : [],
		allCategories: state.buildAllCategories(categories, apiPage.pageid, []),
		seen: 0,
		aliases: [apiPage.title],
	};
	return state.cachePage(post);
}

state.hydrateByTitles = async function hydrateByTitles(titles) {
	const unique = [...new Set((titles || []).filter(Boolean))];
	if (!unique.length) return [];
	const out = [];
	for (let i = 0; i < unique.length; i += 10) {
		const batch = unique.slice(i, i + 10);
		try {
			const data = await state.wikiQuery({
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
				ppprop: "disambiguation",
			});
			const pages = Object.values(data?.query?.pages || {});
			for (const page of pages) {
				const post = state.apiPageToPost(page);
				if (post) out.push(post);
			}
		} catch (err) {
			console.warn("hydrateByTitles failed", err);
		}
	}
	await state.resolvePostLinks(out);
	return out;
}

state.hydrateByPageIds = async function hydrateByPageIds(ids) {
	const unique = [...new Set((ids || []).map(Number).filter(Boolean))];
	if (!unique.length) return [];
	const out = [];
	for (let i = 0; i < unique.length; i += 10) {
		const batch = unique.slice(i, i + 10);
		try {
			const data = await state.wikiQuery({
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
				ppprop: "disambiguation",
			});
			for (const page of Object.values(data?.query?.pages || {})) {
				const post = state.apiPageToPost(page);
				if (post) out.push(post);
			}
		} catch (err) {
			console.warn("hydrateByPageIds failed", err);
		}
	}
	await state.resolvePostLinks(out);
	return out;
}

state.resolvePostLinks = async function resolvePostLinks(posts) {
	// Some generator queries omit links; backfill from a titles query when needed.
	const needLinks = posts.filter(p => !(p.linkTitles || []).length && p.title);
	for (let i = 0; i < needLinks.length; i += 10) {
		const batch = needLinks.slice(i, i + 10);
		try {
			const data = await state.wikiQuery({
				action: "query",
				redirects: 1,
				titles: batch.map(p => p.title).join("|"),
				prop: "links",
				plnamespace: 0,
				pllimit: 50,
			});
			const byTitle = new Map(
				Object.values(data?.query?.pages || {}).map(p => [p.title, p])
			);
			for (const post of batch) {
				const page = byTitle.get(post.title);
				if (page?.links?.length)
					post.linkTitles = page.links.map(l => l.title).filter(Boolean);
			}
		} catch (err) {
			console.warn("link backfill failed", err);
		}
	}

	const titles = [];
	for (const post of posts) {
		(post.linkTitles || []).forEach(t => titles.push(t));
	}
	const unique = [...new Set(titles)].slice(0, 120);
	if (!unique.length) return;
	const titleToId = new Map();
	for (let i = 0; i < unique.length; i += 20) {
		const batch = unique.slice(i, i + 20);
		try {
			const data = await state.wikiQuery({
				action: "query",
				redirects: 1,
				titles: batch.join("|"),
				prop: "info|pageimages",
				piprop: "name",
				pithumbsize: 720,
			});
			const { resolve } = state.indexQueryPages(data);
			for (const title of batch) {
				const page = resolve(title);
				if (page) titleToId.set(title, page.id);
			}
		} catch (err) {
			console.warn("resolvePostLinks failed", err);
		}
	}
	for (const post of posts) {
		const ids = [];
		for (const title of (post.linkTitles || [])) {
			const id = titleToId.get(title) || state.getPageByTitle(title)?.id;
			if (id) ids.push(id);
		}
		post.links = ids;
		post.allCategories = state.buildAllCategories(post.categories, post.id, ids);
		state.cachePage(post);
	}
}

state.prefetchRelatedThumbs = async function prefetchRelatedThumbs(post) {
	if (!post) return [];
	await state.ensureSummaryLinkRefs(post);

	// Resolve intro link targets (including piped-label destinations) + fill thumbs.
	const refTargets = (post._summaryLinkRefs || []).map(r => r.target);
	const needTitles = [...new Set([
		...refTargets,
		...(post.linkTitles || []),
	])].filter(t => {
		const page = state.getPageByTitle(t);
		return !page || !page.thumb;
	}).slice(0, 40);

	for (let i = 0; i < needTitles.length; i += 20) {
		const batch = needTitles.slice(i, i + 20);
		try {
			const data = await state.wikiQuery({
				action: "query",
				redirects: 1,
				titles: batch.join("|"),
				prop: "pageimages|info",
				piprop: "thumbnail|name",
				pithumbsize: 720,
			});
			const { resolve } = state.indexQueryPages(data);
			for (const title of batch) resolve(title);
		} catch (err) {
			console.warn("prefetchRelatedThumbs failed", err);
		}
	}

	const related = state.findRelatedInSummary(post);
	post._relatedInSummary = related;
	return related;
}

state.fetchRandomCandidates = async function fetchRandomCandidates(limit = 8) {
	try {
		const data = await state.wikiQuery({
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
			ppprop: "disambiguation",
		}, { useCache: false });
		const posts = Object.values(data?.query?.pages || {}).map(state.apiPageToPost).filter(Boolean);
		await state.resolvePostLinks(posts);
		return posts;
	} catch (err) {
		console.warn("fetchRandomCandidates failed", err);
		return [];
	}
}

state.fetchCategoryCandidates = async function fetchCategoryCandidates(categoryKey, limit = 8) {
	const gcmTitle = state.categoryTitleFromKey(categoryKey);
	if (!gcmTitle) return [];
	try {
		const data = await state.wikiQuery({
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
			ppprop: "disambiguation",
		}, { useCache: false });
		const posts = Object.values(data?.query?.pages || {}).map(state.apiPageToPost).filter(Boolean);
		await state.resolvePostLinks(posts);
		return posts;
	} catch {
		return [];
	}
}

state.topInterestCategories = function topInterestCategories(limit = 5) {
	return Object.entries(state.categoryScores)
		.filter(([cat, score]) =>
			!String(cat).startsWith("p:") &&
			!state.isNoiseTopic(cat) &&
			Number(score) > 0
		)
		.sort((a, b) => Number(b[1]) - Number(a[1]))
		.slice(0, limit)
		.map(([cat]) => cat);
}

state.scoreCandidate = function scoreCandidate(post) {
	const initialScore = (post.thumb ? 5 : 0)
		+ (3 ** (post.seen ?? 0) - 1) * -50000
		+ (state.dislikedPosts.includes(post.id) ? -100000 : 0)
		+ (state.likedPosts.includes(post.id) ? 25 : 0);
	const cats = post.allCategories || state.buildAllCategories(post.categories, post.id, post.links);
	return [...cats].reduce((sum, cat) => sum + (state.categoryScores[cat] ?? 0), initialScore);
}

state.pickScoredPost = function pickScoredPost(potentialPosts) {
	if (!potentialPosts.length) return null;
	potentialPosts.forEach(post => { post.score = state.scoreCandidate(post); });
	const pool = [...potentialPosts];
	let bestPost = pool[0];
	if (Math.random() < 0.4) {
		const minScore = Math.min(...pool.map(e => e.score));
		const maxScore = pool.reduce((sum, post) => sum + post.score - minScore, 0) || 1;
		const targetScore = Math.random() * maxScore;
		let scoreCount = 0;
		const working = [...pool];
		while (scoreCount < targetScore && working.length) {
			const potentialPost = working.pop();
			bestPost = potentialPost;
			scoreCount += potentialPost.score - minScore;
		}
	} else if (Math.random() > 0.3) {
		let highestScore = -Infinity;
		pool.forEach(post => {
			if (post.score > highestScore) {
				bestPost = post;
				highestScore = post.score;
			}
		});
	} else {
		bestPost = pool[Math.floor(Math.random() * pool.length)];
	}
	return bestPost;
}

state.refillCandidatePool = async function refillCandidatePool() {
	const need = Math.max(0, state.PREFETCH_AHEAD + 2 - state.candidateQueue.length);
	if (need <= 0) return;
	const gathered = [];
	const roll = Math.random();
	if (roll < 0.5) {
		const cats = state.topInterestCategories(5);
		if (cats.length) {
			const cat = cats[Math.floor(Math.random() * cats.length)];
			gathered.push(...await state.fetchCategoryCandidates(cat, Math.min(10, need + 2)));
		}
	}
	if (roll >= 0.5 && roll < 0.8 || gathered.length < need) {
		gathered.push(...await state.fetchRandomCandidates(Math.min(10, need + 2)));
	}
	if (roll >= 0.8 || gathered.length < need) {
		const likedIds = state.likedPosts.slice(-8);
		const linkTitles = [];
		for (const id of likedIds) {
			const page = state.getPageById(id);
			(page?.linkTitles || []).forEach(t => linkTitles.push(t));
			(page?.links || []).forEach(lid => {
				const linked = state.getPageById(lid);
				if (linked?.title) linkTitles.push(linked.title);
			});
		}
		if (linkTitles.length)
			gathered.push(...await state.hydrateByTitles(linkTitles.sort(() => Math.random() - 0.5).slice(0, need + 2)));
	}
	if (!gathered.length)
		gathered.push(...await state.fetchRandomCandidates(need + 2));

	const queuedIds = new Set(state.candidateQueue.map(p => p.id));
	const visibleIds = new Set(
		[...(state.postsRoot()?.querySelectorAll(".post") || [])].map(el => Number(el.dataset.postId))
	);
	const fresh = gathered.filter(p => p && !queuedIds.has(p.id) && !visibleIds.has(p.id));
	while (state.candidateQueue.length < state.PREFETCH_AHEAD + 2 && fresh.length) {
		const pick = state.pickScoredPost(fresh);
		if (!pick) break;
		const idx = fresh.findIndex(p => p.id === pick.id);
		if (idx >= 0) fresh.splice(idx, 1);
		state.candidateQueue.push(pick);
		queuedIds.add(pick.id);
	}
}

state.getNextPost = async function getNextPost() {
	if (state.candidateQueue.length < 2)
		await state.refillCandidatePool();
	let post = state.candidateQueue.shift();
	if (!post) {
		await state.refillCandidatePool();
		post = state.candidateQueue.shift();
	}
	if (!post) return null;
	if (!post.text || post.text.length < 20) {
		const hydrated = await state.hydrateByPageIds([post.id]);
		post = hydrated[0] || post;
	}
	await state.prefetchRelatedThumbs(post);
	state.markPostSeen(post);
	state.cachePage(post);
	return post;
}

state.convertCat = function convertCat(category) {
	return String(category || "").replace(/^Category:/i, "").replace(/_/g, " ").trim().toLowerCase();
}

state.buildAllCategories = function buildAllCategories(categories = [], pageId, linkIds = []) {
	const keys = new Set(categories.map(state.convertCat).filter(category => category && !state.isNoiseTopic(category)));
	if (pageId) keys.add(`p:${pageId}`);
	for (const id of linkIds || []) if (id) keys.add(`p:${id}`);
	return keys;
}

state.engagePost = function engagePost(post, amount) {
	if (!post) return 0;
	const applied = Number(amount) || 0;
	for (const category of post.allCategories || state.buildAllCategories(post.categories, post.id, post.links))
		state.categoryScores[category] = (state.categoryScores[category] || 0) + applied;
	return applied;
}

state.getArticleLink = function getArticleLink(title, forceCurrentWiki = false) {
	const lang = forceCurrentWiki || !state.settings.openMainWiki ? state.settings.wikiLang : "en";
	return `https://${state.wikiSiteHost(lang)}/wiki/${encodeURIComponent(String(title || "").replace(/ /g, "_"))}`;
}

state.shareArticle = async function shareArticle(post, shareButton) {
	const payload = { title: post.title, text: post.text, url: state.postUrl(post) };
	try {
		if (navigator.share) await navigator.share(payload);
		else if (navigator.clipboard) await navigator.clipboard.writeText(payload.url);
		if (shareButton) shareButton.dataset.shared = "1";
	} catch (error) {
		if (error?.name !== "AbortError") console.warn("Could not share article", error);
	}
}

state.resolveLinkTitle = function resolveLinkTitle(pageId) {
	return state.getPageById(pageId)?.title || "";
}

state.findRelatedInSummary = function findRelatedInSummary(post) {
	const text = String(post?.text || "").toLowerCase();
	if (!text || !post) return [];
	const out = [];
	const seenIds = new Set();

	const mentionInText = (page, preferredLabel) => {
		const candidates = [
			preferredLabel,
			page?.title,
			...(page?.aliases || []),
		].filter(Boolean);
		// Prefer longer phrases so "Spanish Cup" wins over a stray short alias.
		candidates.sort((a, b) => String(b).length - String(a).length);
		return candidates.find(n => text.includes(String(n).toLowerCase())) || null;
	};

	const push = (page, preferredLabel) => {
		if (!page?.id || page.id === post.id || seenIds.has(page.id)) return;
		const label = mentionInText(page, preferredLabel);
		if (!label) return;
		seenIds.add(page.id);
		out.push({ id: page.id, page, title: page.title, label });
	};

	// Lead wikitext refs first — labels match spoken extract (piped links).
	for (const ref of post._summaryLinkRefs || []) {
		if (!text.includes(String(ref.label).toLowerCase())) continue;
		const page = state.getPageByTitle(ref.target);
		if (page) push(page, ref.label);
	}

	// Fallback: resolved outgoing links whose title/alias appears in the extract.
	for (const id of post.links || [])
		push(state.getPageById(id), null);

	return out.slice(0, state.RELATED_LINK_CAP);
}

export const wikiQuery = (...args) => state.wikiQuery(...args);
export const clearLiveCaches = (...args) => state.clearLiveCaches(...args);
