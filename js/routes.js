import { state } from "./state.js";

/** Wikipedia-style slug: spaces → underscores, then URI-encode. */
state.titleToSlug = function titleToSlug(title) {
	const raw = String(title || "").trim().replace(/\s+/g, "_");
	if (!raw) return "";
	return encodeURIComponent(raw);
};

state.slugToTitle = function slugToTitle(slug) {
	if (!slug) return "";
	try {
		return decodeURIComponent(String(slug)).replace(/_/g, " ").trim();
	} catch {
		return String(slug).replace(/_/g, " ").trim();
	}
};

state.isWikiLangCode = function isWikiLangCode(code) {
	const c = String(code || "").toLowerCase();
	if (!c) return false;
	return (state.WIKI_LANGUAGES || []).some(l => l.code === c);
};

state.normalizeWikiLang = function normalizeWikiLang(code) {
	const c = String(code || "").toLowerCase();
	if (state.isWikiLangCode(c)) return c;
	return state.settings?.wikiLang || "simple";
};

/** Canonical post path: /p/{lang}/{slug} */
state.postPathForRoute = function postPathForRoute({ lang, slug } = {}) {
	const base = state.BASE_PATH.endsWith("/") ? state.BASE_PATH : `${state.BASE_PATH}/`;
	const l = state.normalizeWikiLang(lang || state.settings?.wikiLang);
	const s = slug || "";
	if (!s) return `${base}p/${l}/`;
	return `${base}p/${l}/${s}`;
};

/** @deprecated use postPathForRoute — kept for call sites that only have a slug */
state.postPathForSlug = function postPathForSlug(slug, lang) {
	return state.postPathForRoute({ lang, slug });
};

state.postUrl = function postUrl(post) {
	const slug = state.titleToSlug(post?.title);
	if (!slug) return `${location.origin}${state.BASE_PATH}`;
	const lang = post?.wikiLang || state.settings?.wikiLang;
	return `${location.origin}${state.postPathForRoute({ lang, slug })}`;
};

/**
 * Read post route from path (/p/{lang}/{slug} or legacy /p/{slug}),
 * hash (#/p/…), or ?p= / ?lang=.
 * @returns {{ lang: string|null, slug: string }}
 */
state.readPostRouteFromLocation = function readPostRouteFromLocation() {
	const base = state.BASE_PATH.endsWith("/") ? state.BASE_PATH : `${state.BASE_PATH}/`;
	const path = location.pathname || "";
	const prefix = `${base}p/`;
	const langParam = new URLSearchParams(location.search).get("lang");

	const fromParts = (parts) => {
		const segs = (parts || []).filter(Boolean);
		if (!segs.length) return { lang: null, slug: "" };
		if (segs.length >= 2 && state.isWikiLangCode(segs[0]))
			return { lang: segs[0].toLowerCase(), slug: segs.slice(1).join("/") };
		return { lang: null, slug: segs[0] };
	};

	if (path.startsWith(prefix)) {
		const rest = path.slice(prefix.length).replace(/\/+$/, "");
		const route = fromParts(rest.split("/"));
		if (route.slug) {
			if (!route.lang && langParam && state.isWikiLangCode(langParam))
				route.lang = langParam.toLowerCase();
			return route;
		}
	}

	const hash = (location.hash || "").replace(/^#\/?/, "");
	const hashBody = hash.replace(/^p\//i, "");
	if (hashBody && hashBody !== "p") {
		const route = fromParts(hashBody.split("/"));
		if (route.slug) {
			if (!route.lang && langParam && state.isWikiLangCode(langParam))
				route.lang = langParam.toLowerCase();
			return route;
		}
	}

	const q = new URLSearchParams(location.search).get("p");
	if (q) {
		const decoded = (() => {
			try { return decodeURIComponent(q); } catch { return q; }
		})();
		if (decoded.includes("/")) {
			const route = fromParts(decoded.split("/"));
			if (route.slug) return route;
		}
		const slug = state.titleToSlug(state.slugToTitle(q)) || encodeURIComponent(String(q).replace(/\s+/g, "_"));
		const lang = langParam && state.isWikiLangCode(langParam) ? langParam.toLowerCase() : null;
		return { lang, slug };
	}
	return { lang: null, slug: "" };
};

state.readPostSlugFromLocation = function readPostSlugFromLocation() {
	return state.readPostRouteFromLocation().slug;
};

state.syncPostSlugToLocation = function syncPostSlugToLocation(post, { replace = true } = {}) {
	if (state._ignoreRouteSync || !post?.title) return;
	if (state.appPageIsOpen?.()) return;
	const slug = state.titleToSlug(post.title);
	if (!slug) return;
	const lang = state.normalizeWikiLang(post.wikiLang || state.settings?.wikiLang);
	const nextUrl = state.postPathForRoute({ lang, slug });
	const current = state.readPostRouteFromLocation();
	const currentLang = state.normalizeWikiLang(current.lang || state.settings?.wikiLang);
	if (
		current.slug === slug
		&& currentLang === lang
		&& location.pathname.replace(/\/+$/, "") === nextUrl.replace(/\/+$/, "")
	) {
		document.title = `${post.title} — Tikipedia`;
		return;
	}
	try {
		const hist = { postSlug: slug, postLang: lang };
		if (replace) history.replaceState(hist, "", nextUrl);
		else history.pushState(hist, "", nextUrl);
	} catch (err) {
		console.warn("Could not update post URL", err);
	}
	document.title = `${post.title} — Tikipedia`;
};

state.findPostElBySlug = function findPostElBySlug(slug) {
	const title = state.slugToTitle(slug).toLowerCase();
	const slugNorm = state.titleToSlug(state.slugToTitle(slug));
	const root = state.postsRoot();
	if (!root) return null;
	return [...root.querySelectorAll(".post")].find(el => {
		const t = el._postData?.title;
		if (!t) return false;
		return state.titleToSlug(t) === slugNorm || t.toLowerCase() === title;
	}) || null;
};

/** Hydrate (if needed) and show a post for a Wikipedia title slug. */
state.openPostBySlug = async function openPostBySlug(slug, { historyMode = "replace", lang = null } = {}) {
	const title = state.slugToTitle(slug);
	if (!title) return null;

	if (lang && state.isWikiLangCode(lang) && state.setWikiLang)
		await state.setWikiLang(lang, { restartFeed: false });

	const existing = state.findPostElBySlug(slug);
	if (existing) {
		state._routeHistoryMode = historyMode;
		existing.scrollIntoView({ behavior: "smooth", block: "start" });
		state.setActivePost(existing, true);
		return existing;
	}

	state.loadStatus?.(`Loading ${title}…`);
	let post = state.getPageByTitle(title);
	if (!post?.text || post.text.length < 20) {
		const hydrated = await state.hydrateByTitles([title]);
		post = hydrated[0] || post;
	}
	if (!post?.text) return null;
	post.wikiLang = state.settings?.wikiLang || "simple";

	const el = state.buildPostElement(post);
	const root = state.postsRoot();
	if (!root) return null;
	if (state.activePostEl?.parentNode === root)
		state.activePostEl.after(el);
	else
		root.prepend(el);
	state.observePost(el);
	state._routeHistoryMode = historyMode;
	el.scrollIntoView({ block: "start" });
	state.setActivePost(el, true);
	state.ensurePrefetch();
	return el;
};

state.appPagePath = function appPagePath(name) {
	const base = state.BASE_PATH.endsWith("/") ? state.BASE_PATH : `${state.BASE_PATH}/`;
	if (!name || name === "foryou") return base;
	return `${base}${name}`;
};

state.readAppPageFromLocation = function readAppPageFromLocation() {
	const base = state.BASE_PATH.endsWith("/") ? state.BASE_PATH : `${state.BASE_PATH}/`;
	const path = (location.pathname || "").replace(/\/+$/, "") || "";
	const baseTrim = base.replace(/\/+$/, "");
	const rest = path.startsWith(baseTrim) ? path.slice(baseTrim.length).replace(/^\/+/, "") : "";
	const first = rest.split("/")[0];
	if (["profiles", "stats", "settings", "about", "following"].includes(first))
		return first;
	return "";
};

state.syncAppPageToLocation = function syncAppPageToLocation(name, { replace = true } = {}) {
	if (state._ignoreRouteSync) return;
	if (name === "foryou") {
		// Restore the active post slug when returning to the feed.
		if (state.activePostData)
			state.syncPostSlugToLocation(state.activePostData, { replace });
		else {
			const url = state.appPagePath("foryou");
			try {
				if (replace) history.replaceState({ appPage: "foryou" }, "", url);
				else history.pushState({ appPage: "foryou" }, "", url);
			} catch {}
			document.title = "Tikipedia — Wikipedia Shorts";
		}
		return;
	}
	const url = state.appPagePath(name);
	try {
		if (replace) history.replaceState({ appPage: name }, "", url);
		else history.pushState({ appPage: name }, "", url);
	} catch (err) {
		console.warn("Could not update page URL", err);
	}
	const titles = {
		following: "Following",
		profiles: "Profiles",
		stats: "Statistics",
		settings: "Settings",
		about: "About",
	};
	document.title = `${titles[name] || name} — Tikipedia`;
};

state.initPostRouting = function initPostRouting() {
	if (state._postRoutingReady) return;
	state._postRoutingReady = true;
	state._routeHistoryMode = "replace";
	window.addEventListener("popstate", () => {
		const appPage = history.state?.appPage || state.readAppPageFromLocation();
		if (appPage && appPage !== "foryou") {
			state._ignoreRouteSync = true;
			state.showAppPage(appPage, { historyMode: "none" });
			state._ignoreRouteSync = false;
			return;
		}
		const route = state.readPostRouteFromLocation();
		const slug = history.state?.postSlug || route.slug;
		const lang = history.state?.postLang || route.lang;
		state._ignoreRouteSync = true;
		if (slug) {
			state.showAppPage("foryou", { historyMode: "none" });
			state.openPostBySlug(slug, { historyMode: "none", lang }).finally(() => {
				state._ignoreRouteSync = false;
			});
		} else {
			state.showAppPage("foryou", { historyMode: "none" });
			state._ignoreRouteSync = false;
		}
	});
};
