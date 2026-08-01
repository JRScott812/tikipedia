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

state.postPathForSlug = function postPathForSlug(slug) {
	const base = state.BASE_PATH.endsWith("/") ? state.BASE_PATH : `${state.BASE_PATH}/`;
	return `${base}p/${slug}`;
};

state.postUrl = function postUrl(post) {
	const slug = state.titleToSlug(post?.title);
	if (!slug) return `${location.origin}${state.BASE_PATH}`;
	return `${location.origin}${state.postPathForSlug(slug)}`;
};

/** Read a post slug from path (/p/…), hash (#/p/…), or ?p=. */
state.readPostSlugFromLocation = function readPostSlugFromLocation() {
	const base = state.BASE_PATH.endsWith("/") ? state.BASE_PATH : `${state.BASE_PATH}/`;
	const path = location.pathname || "";
	const prefix = `${base}p/`;
	if (path.startsWith(prefix)) {
		const rest = path.slice(prefix.length).replace(/\/+$/, "");
		if (rest) return rest.split("/")[0];
	}

	const hash = (location.hash || "").replace(/^#\/?/, "");
	const hashMatch = hash.match(/^(?:p\/)?(.+)$/);
	if (hashMatch?.[1] && hashMatch[1] !== "p")
		return hashMatch[1].split("/")[0];

	const q = new URLSearchParams(location.search).get("p");
	if (q) return state.titleToSlug(state.slugToTitle(q)) || encodeURIComponent(q.replace(/\s+/g, "_"));
	return "";
};

state.syncPostSlugToLocation = function syncPostSlugToLocation(post, { replace = true } = {}) {
	if (state._ignoreRouteSync || !post?.title) return;
	if (state.appPageIsOpen?.()) return;
	const slug = state.titleToSlug(post.title);
	if (!slug) return;
	const nextUrl = state.postPathForSlug(slug);
	const currentSlug = state.readPostSlugFromLocation();
	if (currentSlug === slug && location.pathname.replace(/\/+$/, "") === nextUrl.replace(/\/+$/, "")) {
		document.title = `${post.title} — Tikipedia`;
		return;
	}
	try {
		if (replace) history.replaceState({ postSlug: slug }, "", nextUrl);
		else history.pushState({ postSlug: slug }, "", nextUrl);
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
state.openPostBySlug = async function openPostBySlug(slug, { historyMode = "replace" } = {}) {
	const title = state.slugToTitle(slug);
	if (!title) return null;

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
		const slug = history.state?.postSlug || state.readPostSlugFromLocation();
		state._ignoreRouteSync = true;
		if (slug) {
			state.showAppPage("foryou", { historyMode: "none" });
			state.openPostBySlug(slug, { historyMode: "none" }).finally(() => {
				state._ignoreRouteSync = false;
			});
		} else {
			state.showAppPage("foryou", { historyMode: "none" });
			state._ignoreRouteSync = false;
		}
	});
};
