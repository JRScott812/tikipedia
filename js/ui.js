import { state } from "./state.js";
state.installPrompt = null;

if (state.installButton) {
	if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone) {
		state.installButton.classList.remove("hidden");
		state.installButton.onclick = () => alert("To install Tikipedia on iOS, open this site in Safari, tap Share, then Add to Home Screen.");
	} else if (!window.matchMedia('(display-mode: standalone)').matches && !window.chrome) {
		state.installButton.classList.remove("hidden");
		state.installButton.onclick = () => alert("To install Tikipedia, open it in Chrome or check how your browser installs PWAs.");
	}

	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		state.installPrompt = event;
		state.installButton.classList.remove("hidden");
	});
	state.installButton.addEventListener("click", async () => {
		if (!state.installPrompt) {
			return state.installButton.classList.add("hidden");
		}
		// make sure index is always cached
		await (await fetch(state.BASE_PATH)).text();
		const result = await state.installPrompt.prompt();
		console.log(`Install prompt was: ${result.outcome}`);
		state.disableInAppInstallPrompt();
	});
}

state.disableInAppInstallPrompt = function disableInAppInstallPrompt() {
	state.installPrompt = null;
	state.installButton?.classList.add("hidden");
}

window.swReg = null;
if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register(state.basePath("sw.js"), { scope: state.BASE_PATH }).then(reg => window.swReg = reg).catch(err => {
		window.swReg = "err";
		console.error(`Registration failed with ${err}`);
	});
	navigator.serviceWorker.addEventListener('message', event => {
		if (event.data.event == "downloadProgress")
			state.updateProgress?.(event.data.data);
	})
} else {
	window.swReg = "err";
}

state.settingsModal?.querySelectorAll("input").forEach(e => e.onchange = state.saveSettings);
if (state.voiceSelect) state.voiceSelect.onchange = state.onVoiceSettingsChanged;
if (state.speechRateInput) state.speechRateInput.oninput = state.onVoiceSettingsChanged;
if (state.captionSizeInput) state.captionSizeInput.oninput = state.onCaptionSettingsChanged;
if (state.captionStrokeInput) state.captionStrokeInput.oninput = state.onCaptionSettingsChanged;
if (state.previewVoiceBtn) state.previewVoiceBtn.onclick = (e) => {
	e.preventDefault();
	state.previewSelectedVoice();
};

state.CAPTION_PREVIEW_SAMPLES = {
	noun: "Wikipedia",
	verb: "discovered",
	adjective: "ancient",
	adverb: "quickly",
	preposition: "through",
	article: "the",
	pronoun: "they",
	conjunction: "and",
	number: "42",
	date: "1945",
	link: "Einstein",
	other: "hello",
};

state.populateCaptionColorKey = function populateCaptionColorKey() {
	const el = document.getElementById("captionColorKey");
	if (!el) return;
	el.innerHTML = "";
	Object.keys(state.CAP_ROLE_LABELS).forEach(role => {
		const li = document.createElement("li");
		li.className = "colorKeyItem";
		const swatch = document.createElement("span");
		swatch.className = "colorKeySwatch";
		swatch.style.setProperty("--cap-color", state.CAP_ROLE_COLORS[role]);
		swatch.textContent = "Aa";
		const label = document.createElement("span");
		label.textContent = state.CAP_ROLE_LABELS[role];
		li.appendChild(swatch);
		li.appendChild(label);
		el.appendChild(li);
	});
	state.updateCaptionPreview();
}

state.updateCaptionPreview = function updateCaptionPreview() {
	const word = document.getElementById("captionPreviewWord");
	const meta = document.getElementById("captionPreviewMeta");
	if (!word) return;
	const roles = Object.keys(state.CAP_ROLE_LABELS || {});
	if (!roles.length) {
		word.textContent = "Wikipedia";
		word.style.setProperty("--cap-color", "#FFE566");
		if (meta) meta.textContent = "Preview";
		return;
	}
	const i = (state._captionPreviewIndex || 0) % roles.length;
	const role = roles[i];
	word.textContent = state.CAPTION_PREVIEW_SAMPLES[role] || state.CAP_ROLE_LABELS[role] || "Aa";
	word.style.setProperty("--cap-color", state.CAP_ROLE_COLORS[role] || "#FFE566");
	if (meta) meta.textContent = state.CAP_ROLE_LABELS[role] || role;
}

state.startCaptionPreviewCycle = function startCaptionPreviewCycle() {
	state.stopCaptionPreviewCycle();
	state.updateCaptionPreview();
	state._captionPreviewTimer = setInterval(() => {
		const roles = Object.keys(state.CAP_ROLE_LABELS || {});
		if (!roles.length) return;
		state._captionPreviewIndex = ((state._captionPreviewIndex || 0) + 1) % roles.length;
		state.updateCaptionPreview();
	}, 1600);
}

state.stopCaptionPreviewCycle = function stopCaptionPreviewCycle() {
	if (state._captionPreviewTimer) {
		clearInterval(state._captionPreviewTimer);
		state._captionPreviewTimer = null;
	}
}

state.initDataDependentUi = function initDataDependentUi() {
	state.settings = state.loadSettings();
	if (state.wikiLangSelect) {
		state.wikiLangSelect.innerHTML = "";
		state.WIKI_LANGUAGES.forEach(lang => {
			const opt = document.createElement("option");
			opt.value = lang.code;
			opt.textContent = `${lang.label} (${lang.code})`;
			state.wikiLangSelect.appendChild(opt);
		});
		state.wikiLangSelect.value = state.settings.wikiLang;
		state.wikiLangSelect.onchange = state.onWikiLangChanged;
	}
	state.populateCaptionColorKey();
	if (window.speechSynthesis) {
		state.populateVoiceOptions();
		speechSynthesis.addEventListener("voiceschanged", state.populateVoiceOptions);
	}
}

state.searchDebounce = null;
if (state.categorySearchInput) {
	state.categorySearchInput.addEventListener("input", () => {
		const searchText = state.categorySearchInput.value.trim();
		if (state.categorySearchSelect) state.categorySearchSelect.replaceChildren();
		if (!searchText.length) return;
		clearTimeout(state.searchDebounce);
		state.searchDebounce = setTimeout(async () => {
			try {
				if (!state.settings) state.settings = state.loadSettings();
				const data = await state.wikiQuery({
					action: "opensearch",
					search: searchText,
					limit: 20,
					namespace: 0,
					redirects: "resolve",
				}, { useCache: false });
				const titles = data?.[1] || [];
				if (!state.categorySearchSelect) return;
				state.categorySearchSelect.replaceChildren();
				if (!titles.length) {
					const empty = document.createElement("option");
					empty.disabled = true;
					empty.textContent = "No results";
					state.categorySearchSelect.appendChild(empty);
					return;
				}
				titles.forEach(title => {
					const option = document.createElement("option");
					option.textContent = title;
					option.value = title;
					state.categorySearchSelect.appendChild(option);
				});
			} catch (err) {
				console.warn("search failed", err);
				if (state.categorySearchSelect) {
					state.categorySearchSelect.replaceChildren();
					const empty = document.createElement("option");
					empty.disabled = true;
					empty.textContent = "Search failed";
					state.categorySearchSelect.appendChild(empty);
				}
			}
		}, 250);
	});
}

if (state.categorySearchSelect) {
	// <select> selection is reliable on `change` (not `input` in all browsers).
	state.categorySearchSelect.addEventListener("change", () => {
		const value = state.categorySearchSelect.value;
		if (!value || value === "...") return;
		state.addPickableCategory(value, true);
		state.categorySearchSelect.selectedIndex = -1;
	});
}

state.textTime = function textTime(ms) {
	const h = Math.floor(ms / 1000 / 3600);
	const m = Math.floor((ms / 1000 / 60) % 60);
	const s = Math.floor((ms / 1000) % 60);
	let timeText = `${s} second${s == 1 ? '' : 's'}`;
	if (m || h) {
		timeText = `${m} minute${m == 1 ? '' : 's'}`;
	}
	if (h) {
		timeText = `${h} hour${h == 1 ? '' : 's'}, ${m} minute${m == 1 ? '' : 's'}`;
	}
	return timeText;
}

state.topStatsStale = false;
state.likeStatsStale = false;

state.updateTopStats = function updateTopStats() {
	if (!state.topStatsStale)
		return;
	state.topStatsStale = false;
	const sorted = Object.entries(state.categoryScores).filter(e => e[1]).sort((a, b) => b[1] - a[1]);
	const top100 = sorted.slice(0, 100);
	const bottom100 = sorted.slice(sorted.length - 100).reverse();
	document.getElementById("top100").innerText = top100.map(([k, v]) => `${state.convertCat(k)}: ${v}`).join("\n");
	document.getElementById("bottom100").innerText = bottom100.map(([k, v]) => `${state.convertCat(k)}: ${v}`).join("\n");
}

state.updateLikeStats = function updateLikeStats() {
	if (!state.likeStatsStale)
		return;
	state.likeStatsStale = false;
	const fillList = (elId, ids) => {
		const el = document.getElementById(elId);
		if (!el) return;
		el.innerText = "";
		ids.forEach(postId => {
			const post = state.getPageById(postId);
			const link = document.createElement(post ? "a" : "em");
			link.classList.add("likedPostEntry");
			if (post) {
				link.innerText = post.title;
				link.href = state.getArticleLink(post.title);
			} else {
				link.innerText = `Unknown post (id: ${postId})`;
			}
			el.appendChild(link);
		});
	};
	fillList("likedPosts", state.likedPosts);
	fillList("dislikedPosts", state.dislikedPosts);
}

state.APP_PAGE_IDS = {
	following: "followingPage",
	profiles: "profilesPage",
	stats: "statsPage",
	settings: "settingsPage",
	about: "aboutPage",
};

state.currentAppPage = "foryou";

state.appPageIsOpen = function appPageIsOpen() {
	return state.currentAppPage && state.currentAppPage !== "foryou";
};

state.followingPageIsOpen = function followingPageIsOpen() {
	return state.currentAppPage === "following";
};

state.setBottomNavActive = function setBottomNavActive(navKey) {
	state.bottomNav?.querySelectorAll("button[data-nav]").forEach(btn => {
		const on = btn.dataset.nav === navKey;
		btn.classList.toggle("active", on);
		if (on) btn.setAttribute("aria-current", "page");
		else btn.removeAttribute("aria-current");
	});
};

state.setFeedTabsActive = function setFeedTabsActive(tab) {
	const following = tab === "following";
	document.querySelector(".followingTab")?.classList.toggle("active", following);
	document.querySelector(".forYouTab")?.classList.toggle("active", !following);
	if (following) {
		document.querySelector(".followingTab")?.setAttribute("aria-current", "page");
		document.querySelector(".forYouTab")?.removeAttribute("aria-current");
	} else {
		document.querySelector(".forYouTab")?.setAttribute("aria-current", "page");
		document.querySelector(".followingTab")?.removeAttribute("aria-current");
	}
};

state.hideAllAppPages = function hideAllAppPages() {
	Object.values(state.APP_PAGE_IDS).forEach(id => {
		const el = document.getElementById(id);
		if (!el) return;
		el.hidden = true;
		el.inert = true;
		el.scrollTop = 0;
	});
};

state.showAppPage = function showAppPage(name, { historyMode = "replace" } = {}) {
	const feed = state.postsRoot();
	const header = document.querySelector(".feedHeader");
	const prev = state.currentAppPage;
	state.currentAppPage = name || "foryou";
	document.body.dataset.page = state.currentAppPage;
	if (prev === "settings" && state.currentAppPage !== "settings")
		state.stopCaptionPreviewCycle();

	state.hideAllAppPages();

	if (state.currentAppPage === "foryou") {
		if (feed) {
			feed.hidden = false;
			feed.inert = false;
			feed.removeAttribute("aria-hidden");
		}
		if (header) header.hidden = false;
		state.setFeedTabsActive("foryou");
		state.setBottomNavActive("home");
		if (historyMode !== "none")
			state.syncAppPageToLocation("foryou", { replace: historyMode !== "push" });
		if (prev !== "foryou" && state.activePostEl && !document.hidden && !state.descriptionSheet?.open)
			state.resumePlayback();
		state.syncThemeColor?.();
		return;
	}

	state.pausePlayback();
	if (feed) {
		feed.inert = true;
		feed.setAttribute("aria-hidden", "true");
	}

	const pageId = state.APP_PAGE_IDS[state.currentAppPage];
	const page = pageId && document.getElementById(pageId);
	if (!page) {
		state.showAppPage("foryou", { historyMode });
		return;
	}

	if (state.currentAppPage === "following") {
		if (header) header.hidden = false;
		state.setFeedTabsActive("following");
		state.setBottomNavActive("home");
		state.renderFollowingPage();
	} else {
		if (header) header.hidden = true;
		state.setFeedSearchOpen?.(false);
		state.setFeedTabsActive("foryou");
		const navKey = state.currentAppPage === "about" ? "settings" : state.currentAppPage;
		state.setBottomNavActive(navKey);
		if (state.currentAppPage === "profiles") state.renderProfilesPage();
		if (state.currentAppPage === "stats") state.renderStatsPage();
		if (state.currentAppPage === "settings") state.prepareSettingsPage();
	}

	page.hidden = false;
	page.inert = false;
	if (historyMode !== "none")
		state.syncAppPageToLocation(state.currentAppPage, { replace: historyMode !== "push" });
	state.syncThemeColor?.();
};

state.renderStatsPage = function renderStatsPage() {
	state.topStatsStale = true;
	state.likeStatsStale = true;
	const general = document.getElementById("generalStats");
	if (general) {
		general.innerText = `Shorts watched (total): ${state.seenPosts.length}\nShorts watched (session): ${state.seenPosts.length - state.likesLen}\nTime watching (total): ${state.textTime(state.timeSpentTotal)}\nTime watching (session): ${state.textTime(state.timeSpentSession)}`;
	}
	document.querySelectorAll("#statsPage details").forEach(e => { e.open = false; });
};

state.prepareSettingsPage = function prepareSettingsPage() {
	if (state.wikiLangSelect) state.wikiLangSelect.value = state.settings.wikiLang;
	state.populateVoiceOptions();
	state.updateVoiceLangNote();
	state.startCaptionPreviewCycle();
};

state.showFollowingPage = function showFollowingPage() {
	state.showAppPage("following");
};

state.showForYouPage = function showForYouPage() {
	state.showAppPage("foryou");
};

state.showProfilesPage = function showProfilesPage() {
	state.showAppPage("profiles");
};

state.showStatsPage = function showStatsPage() {
	state.showAppPage("stats");
};

state.showSettingsPage = function showSettingsPage() {
	state.showAppPage("settings");
};

state.showAboutPage = function showAboutPage() {
	state.showAppPage("about");
};

// Back-compat names from older HTML / window bindings.
state.showProfilesModal = state.showProfilesPage;
state.showStatsModal = state.showStatsPage;
state.showSettingsModal = state.showSettingsPage;
state.showAboutModal = state.showAboutPage;

document.querySelector(".followingTab")?.addEventListener("click", state.showFollowingPage);
document.querySelector(".forYouTab")?.addEventListener("click", state.showForYouPage);

state.articleSearchDebounce = null;
state.articleSearchActiveIndex = -1;

/**
 * Parse a typed query, pasted /p/{lang}/{slug} URL, or raw title.
 * @returns {{ title: string, lang: string|null }}
 */
state.parseReelQuery = function parseReelQuery(raw) {
	let q = String(raw || "").trim();
	if (!q) return { title: "", lang: null };
	let langParam = null;
	try {
		if (/^https?:\/\//i.test(q)) {
			const url = new URL(q);
			langParam = url.searchParams.get("lang");
			q = url.pathname + url.search + url.hash;
		}
	} catch { /* keep raw */ }

	const fromParts = (parts) => {
		const segs = (parts || []).filter(Boolean);
		if (!segs.length) return { title: "", lang: null };
		if (segs.length >= 2 && state.isWikiLangCode(segs[0]))
			return { lang: segs[0].toLowerCase(), title: state.slugToTitle(segs.slice(1).join("/")) };
		return { lang: null, title: state.slugToTitle(segs[0]) };
	};

	const pathMatch = q.match(/\/p\/([^?#]+)/i) || q.match(/^p\/([^?#]+)/i);
	if (pathMatch) {
		const route = fromParts(pathMatch[1].split("/"));
		if (!route.lang && langParam && state.isWikiLangCode(langParam))
			route.lang = langParam.toLowerCase();
		return route;
	}

	const paramMatch = q.match(/[?&#]p=([^&]+)/i);
	if (paramMatch) {
		let p = paramMatch[1];
		try { p = decodeURIComponent(p); } catch { /* keep */ }
		if (p.includes("/")) return fromParts(p.split("/"));
		const lang = langParam && state.isWikiLangCode(langParam) ? langParam.toLowerCase() : null;
		return { title: state.slugToTitle(p), lang };
	}

	if (/_/.test(q) && !/\s/.test(q) && !q.includes("/"))
		return { title: state.slugToTitle(q), lang: null };
	return { title: q.replace(/_/g, " ").trim(), lang: null };
};

state.setFeedSearchOpen = function setFeedSearchOpen(open) {
	const panel = state.feedSearchPanel;
	const toggle = state.feedSearchToggle;
	const header = state.feedHeader;
	if (!panel || !toggle) return;
	panel.hidden = !open;
	toggle.setAttribute("aria-expanded", open ? "true" : "false");
	header?.classList.toggle("feedHeader--searchOpen", open);
	if (open) {
		state.feedSearchInput?.focus();
		state.feedSearchInput?.select();
	} else {
		state.clearFeedSearchResults();
		state.articleSearchActiveIndex = -1;
	}
};

state.clearFeedSearchResults = function clearFeedSearchResults() {
	if (state.feedSearchResults) {
		state.feedSearchResults.innerHTML = "";
		state.feedSearchResults.hidden = true;
	}
	if (state.feedSearchStatus) {
		state.feedSearchStatus.hidden = true;
		state.feedSearchStatus.textContent = "";
	}
};

state.setFeedSearchStatus = function setFeedSearchStatus(text) {
	if (!state.feedSearchStatus) return;
	if (!text) {
		state.feedSearchStatus.hidden = true;
		state.feedSearchStatus.textContent = "";
		return;
	}
	state.feedSearchStatus.hidden = false;
	state.feedSearchStatus.textContent = text;
};

state.renderFeedSearchResults = function renderFeedSearchResults(titles) {
	const list = state.feedSearchResults;
	if (!list) return;
	list.innerHTML = "";
	state.articleSearchActiveIndex = -1;
	if (!titles.length) {
		list.hidden = true;
		return;
	}
	list.hidden = false;
	titles.forEach((title, i) => {
		const li = document.createElement("li");
		li.setAttribute("role", "option");
		li.id = `feedSearchOpt-${i}`;
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "feedSearchResult";
		btn.textContent = title;
		btn.addEventListener("click", () => state.openReelByTitle(title));
		li.appendChild(btn);
		list.appendChild(li);
	});
};

state.highlightFeedSearchResult = function highlightFeedSearchResult(index) {
	const buttons = [...(state.feedSearchResults?.querySelectorAll(".feedSearchResult") || [])];
	if (!buttons.length) {
		state.articleSearchActiveIndex = -1;
		return;
	}
	const next = ((index % buttons.length) + buttons.length) % buttons.length;
	state.articleSearchActiveIndex = next;
	buttons.forEach((btn, i) => {
		btn.setAttribute("aria-selected", i === next ? "true" : "false");
		if (i === next) btn.scrollIntoView({ block: "nearest" });
	});
};

state.openReelByTitle = async function openReelByTitle(title, { lang = null } = {}) {
	const clean = String(title || "").trim();
	if (!clean) return null;
	state.setFeedSearchStatus(`Loading ${clean}…`);
	state.showAppPage("foryou", { historyMode: "none" });
	const el = await state.openPostBySlug(state.titleToSlug(clean), {
		historyMode: "push",
		lang: lang || null,
	});
	if (!el) {
		state.setFeedSearchStatus(`Couldn’t find “${clean}”. Try another title.`);
		return null;
	}
	if (state.feedSearchInput) state.feedSearchInput.value = clean;
	state.setFeedSearchOpen(false);
	return el;
};

state.openReelFromQuery = async function openReelFromQuery(raw) {
	const { title, lang } = state.parseReelQuery(raw);
	if (!title) {
		state.setFeedSearchStatus("Type an article title or paste a /p/lang/Title URL.");
		return null;
	}
	return state.openReelByTitle(title, { lang });
};

state.runArticleSearch = async function runArticleSearch(searchText) {
	const q = searchText.trim();
	if (q.length < 2) {
		state.clearFeedSearchResults();
		return;
	}
	// Path/slug paste → skip autocomplete noise
	if (/\/p\//i.test(q) || /^p\//i.test(q) || /^https?:\/\//i.test(q)) {
		state.clearFeedSearchResults();
		const parsed = state.parseReelQuery(q);
		const hint = parsed.lang ? ` (${parsed.lang})` : "";
		state.setFeedSearchStatus(`Press Enter to open${hint}.`);
		return;
	}
	state.setFeedSearchStatus("Searching…");
	try {
		const data = await state.wikiQuery({
			action: "opensearch",
			search: q,
			limit: 8,
			namespace: 0,
			redirects: "resolve",
		}, { useCache: false });
		const titles = data?.[1] || [];
		if (!titles.length) {
			state.clearFeedSearchResults();
			state.setFeedSearchStatus("No articles found.");
			return;
		}
		state.setFeedSearchStatus("");
		state.renderFeedSearchResults(titles);
	} catch (err) {
		console.warn("article search failed", err);
		state.setFeedSearchStatus("Search failed. Check your connection.");
	}
};

state.initFeedSearch = function initFeedSearch() {
	const toggle = state.feedSearchToggle;
	const panel = state.feedSearchPanel;
	const input = state.feedSearchInput;
	if (!toggle || !panel || !input) return;

	toggle.addEventListener("click", (e) => {
		e.stopPropagation();
		state.setFeedSearchOpen(panel.hidden);
	});

	panel.addEventListener("click", (e) => e.stopPropagation());
	panel.addEventListener("submit", async (e) => {
		e.preventDefault();
		const buttons = [...(state.feedSearchResults?.querySelectorAll(".feedSearchResult") || [])];
		if (state.articleSearchActiveIndex >= 0 && buttons[state.articleSearchActiveIndex]) {
			await state.openReelByTitle(buttons[state.articleSearchActiveIndex].textContent);
			return;
		}
		await state.openReelFromQuery(input.value);
	});

	input.addEventListener("input", () => {
		const searchText = input.value;
		clearTimeout(state.articleSearchDebounce);
		state.articleSearchDebounce = setTimeout(() => state.runArticleSearch(searchText), 250);
	});

	input.addEventListener("keydown", (e) => {
		const buttons = [...(state.feedSearchResults?.querySelectorAll(".feedSearchResult") || [])];
		if (e.key === "Escape") {
			e.preventDefault();
			state.setFeedSearchOpen(false);
			return;
		}
		if (!buttons.length) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			state.highlightFeedSearchResult(state.articleSearchActiveIndex + 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			state.highlightFeedSearchResult(state.articleSearchActiveIndex <= 0
				? buttons.length - 1
				: state.articleSearchActiveIndex - 1);
		}
	});

	document.addEventListener("click", (e) => {
		if (panel.hidden) return;
		if (state.feedSearch?.contains(e.target)) return;
		state.setFeedSearchOpen(false);
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !panel.hidden)
			state.setFeedSearchOpen(false);
	});
};

state.initFeedSearch();

state.unlockSpeechAndPlay = function unlockSpeechAndPlay() {
	state.speechUnlocked = true;
	delete state.tapToPlay.dataset.show;
	if (state.activePostEl && state.activePostData && !state.settings.muted) {
		state.speakPost(state.activePostEl, state.activePostData, { restart: true });
	}
}

if (state.tapToPlay) state.tapToPlay.onclick = () => state.unlockSpeechAndPlay();

state.startFeed = async function startFeed() {
	state.initPostRouting();
	const initialPage = state.readAppPageFromLocation();
	if (initialPage) {
		const loadingEl = document.getElementById("loading");
		if (loadingEl) loadingEl.remove();
		await state.ensurePrefetch();
		state.showAppPage(initialPage, { historyMode: "replace" });
		return;
	}
	const initialRoute = state.readPostRouteFromLocation();
	if (initialRoute.slug) {
		state.loadStatus("Loading article…");
		const opened = await state.openPostBySlug(initialRoute.slug, {
			historyMode: "replace",
			lang: initialRoute.lang,
		});
		const loadingEl = document.getElementById("loading");
		if (loadingEl) loadingEl.remove();
		if (opened) {
			await state.ensurePrefetch();
			return;
		}
		state.loadStatus("Article not found — loading feed…");
	}
	state.loadStatus("Fetching shorts…");
	await state.ensurePrefetch();
	const loadingEl = document.getElementById("loading");
	if (loadingEl) loadingEl.remove();
	const first = state.postsRoot().querySelector(".post");
	if (first) state.setActivePost(first, true);
	else state.loadStatus("Couldn't reach Wikipedia. Check your connection and reload.");
}

document.addEventListener("visibilitychange", () => {
	if (document.hidden) state.pausePlayback();
});

document.addEventListener("keydown", (e) => {
	if (state.appPageIsOpen()) return;
	if (state.descriptionSheet?.open) return;
	const root = state.postsRoot();
	if (!root || !state.activePostEl) return;
	if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") {
		e.preventDefault();
		const next = state.activePostEl.nextElementSibling;
		if (next) next.scrollIntoView({ behavior: "smooth", block: "start" });
		else {
			state.createNextPost().then(created => {
				created?.scrollIntoView({ behavior: "smooth", block: "start" });
			});
		}
	} else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
		e.preventDefault();
		const prev = state.activePostEl.previousElementSibling;
		if (prev) prev.scrollIntoView({ behavior: "smooth", block: "start" });
	} else if (e.key === " " || e.code === "Space") {
		e.preventDefault();
		state.togglePause();
	} else if (e.key === "m") {
		state.setMuted(!state.settings.muted);
	}
});

state.addPickableCategory = function addPickableCategory(cat, checked) {
	const list = state.categoryPickList;
	if (!list || !cat) return;
	const key = String(cat);
	if ([...list.querySelectorAll("input[data-category]")].some(el => el.dataset.category === key))
		return;
	const picker = document.createElement("label");
	picker.classList.add("categoryPicker");
	const check = document.createElement("input");
	check.type = "checkbox";
	check.dataset.category = key;
	if (checked) check.checked = true;
	const label = key.slice(0, 1).toUpperCase() + key.slice(1);
	picker.append(document.createTextNode(label), check);
	list.appendChild(picker);
}

state.updateProgress = function updateProgress() {
	// retained for service-worker message compatibility; no dump download progress
}

state.checkVersionAsync = async function checkVersionAsync() {
	try {
		const versionInfo = await (await fetch("version.json", { cache: "no-store" })).json();
		const reg = window.swReg && window.swReg !== "err" ? window.swReg : null;
		// Virtual SW endpoints only work once the worker controls this page.
		// On first visit (or before claim), /swVer hits the static server as 404 and
		// must not trigger an update/reload loop.
		const swControlling = !!(reg && navigator.serviceWorker?.controller);

		if (versionInfo.html != state.HTML_VERSION) {
			if (swControlling) {
				try { await fetch(state.basePath("clearHtml")); } catch {}
			}
			document.location.reload();
			return;
		}

		if (!swControlling || !reg) return;

		const swRes = await fetch(state.basePath("swVer"), { cache: "no-store" });
		if (!swRes.ok) return;
		const swVer = (await swRes.text()).trim();
		if (!/^\d+\.\d+\.\d+/.test(swVer)) return;
		if (versionInfo.sw != swVer) {
			await reg.update();
			document.location.reload();
		}
	} catch (e) {
		console.error("Couldn't check versions", e);
	}
}

state.loadStatus = function loadStatus(text) {
	const loadingEl = document.getElementById("loading");
	if (loadingEl)
		loadingEl.innerText = `Loading...\n(${text})`;
	// Don't overwrite the onboarding continue label while that screen is up.
	if (document.body.dataset.onboarding) return;
	if (state.startBtn && state.startBtn.dataset.ready !== "1")
		state.startBtn.innerText = `Loading shorts... (${text})`;
}

state.main = async function main() {
	if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
		const ios = document.getElementById("iosmessage");
		if (ios) ios.hidden = false;
	}
	state.loadStatus("loading profile");
	const hasProfile = state.initProfile();
	const startScreen = state.startScreen;

	state.populateVoiceOptions();
	state.autoMatchVoiceForLang({ force: state.settings.voiceAutoMatched !== false });

	// Brief wait for SW registration (not a long flicker loop).
	for (let i = 0; i < 50; i++) {
		if (window.swReg && (window.swReg == "err" || window.swReg?.active)) break;
		await new Promise(r => setTimeout(r, 10));
	}
	state.checkVersionAsync();
	state.feedReady = true;

	if (hasProfile) {
		startScreen?.remove?.();
		delete document.body.dataset.onboarding;
		if (state.bottomNav) state.bottomNav.inert = false;
		document.getElementById("loading")?.remove();
		setTimeout(state.saveProfile, 100);
		state.syncThemeColor?.();
		await state.startFeed();
		state.tryUnlockSpeech();
		return;
	}

	// Onboarding: build categories first, then reveal the popover once.
	document.body.dataset.onboarding = "1";
	if (state.bottomNav) state.bottomNav.inert = true;
	state.categoryPickList?.replaceChildren();
	state.defaultCategories.forEach(e => state.addPickableCategory(e));
	state.categorySearchInput?.removeAttribute("disabled");
	if (state.startBtn) {
		state.startBtn.dataset.ready = "1";
		state.startBtn.innerText = "Continue";
		state.startBtn.removeAttribute("disabled");
		state.startBtn.onclick = async () => {
			if (state.bottomNav) state.bottomNav.inert = false;
			const checked = [...document.querySelectorAll(".categoryPicker input:checked")];
			for (const e of checked) {
				state.categoryScores[e.dataset.category] = state.defaultCategories.includes(e.dataset.category) ? 1000 : 5000;
			}
			const customTitles = checked
				.map(e => e.dataset.category)
				.filter(cat => !state.defaultCategories.includes(cat));
			if (customTitles.length) {
				try {
					const pages = await state.hydrateByTitles(customTitles);
					pages.forEach(page => state.engagePost(page, 100));
				} catch (err) {
					console.warn("onboarding hydrate failed", err);
				}
			}
			startScreen?.hidePopover?.();
			startScreen?.remove?.();
			delete document.body.dataset.onboarding;
			setTimeout(state.saveProfile, 100);
			state.syncThemeColor?.();
			state.speechUnlocked = true;
			await state.startFeed();
		};
	}
	document.getElementById("loading")?.remove();
	state.syncThemeColor?.();
	startScreen?.showPopover?.();
}

state.bootstrap = async function bootstrap() {
	try {
		state.loadStatus("loading config…");
		await state.loadAppData();
		state.initDataDependentUi();
		await state.main();
	} catch (err) {
		console.error(err);
		state.loadStatus("Couldn't load app config. Check your connection and reload.");
		const loadingEl = document.getElementById("loading");
		if (loadingEl)
			loadingEl.innerText = `Couldn't load app config.\n${err.message || err}`;
	}
}

state.tryUnlockSpeech = function tryUnlockSpeech() {
	if (!window.speechSynthesis) {
		state.speechUnlocked = true;
		return;
	}
	try {
		const probe = new SpeechSynthesisUtterance(" ");
		probe.volume = 0;
		probe.rate = 2;
		probe.onstart = () => {
			state.speechUnlocked = true;
			delete state.tapToPlay.dataset.show;
			if (state.activePostEl && state.activePostData && !state.settings.muted && !state.playbackPaused)
				state.speakPost(state.activePostEl, state.activePostData, { restart: true });
		};
		probe.onerror = () => {
			state.tapToPlay.dataset.show = "1";
        };
        speechSynthesis.speak(probe);
        // If speak is ignored without error, show overlay after a beat.
        setTimeout(() => {
            if (!state.speechUnlocked && !state.settings.muted)
                state.tapToPlay.dataset.show = "1";
        }, 600);
    } catch {
        state.tapToPlay.dataset.show = "1";
    }
}

export const initDataDependentUi = (...args) => state.initDataDependentUi(...args);
