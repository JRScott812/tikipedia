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
if (state.previewVoiceBtn) state.previewVoiceBtn.onclick = (e) => {
	e.preventDefault();
	state.previewSelectedVoice();
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
state.categorySearchInput.oninput = () => {
	const searchText = state.categorySearchInput.value.trim();
	state.categorySearchSelect.innerText = "";
	if (!searchText.length) return;
	clearTimeout(state.searchDebounce);
	state.searchDebounce = setTimeout(async () => {
		try {
			const data = await state.wikiQuery({
				action: "opensearch",
				search: searchText,
				limit: 20,
				namespace: 0,
				redirects: "resolve",
			}, { useCache: false });
			const titles = data?.[1] || [];
			state.categorySearchSelect.innerText = "";
			titles.forEach(title => {
				const option = document.createElement("option");
				option.innerText = title;
				option.value = title;
				state.categorySearchSelect.appendChild(option);
			});
		} catch (err) {
			console.warn("search failed", err);
		}
	}, 250);
}

state.categorySearchSelect.oninput = () => {
	if (!state.categorySearchSelect.value || state.categorySearchSelect.value == "...")
		return;
	state.addPickableCategory(state.categorySearchSelect.value, true);
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
	const initialSlug = state.readPostSlugFromLocation();
	if (initialSlug) {
		state.loadStatus("Loading article…");
		const opened = await state.openPostBySlug(initialSlug, { historyMode: "replace" });
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
	if (document.querySelector(`.categoryPicker input[data-category="${cat.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`))
		return;
	const picker = document.createElement("label");
	const check = document.createElement("input");
	check.type = "checkbox";
	picker.innerText = `${cat.slice(0, 1).toUpperCase()}${cat.slice(1).toLowerCase()}`;
	picker.appendChild(check);
	picker.classList.add("categoryPicker");
	check.dataset.category = cat;
	if (checked)
		check.checked = true;
	state.categoryPickList.appendChild(picker);
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
	if (state.startBtn) state.startBtn.innerText = `Loading shorts... (${text})`;
	const loadingEl = document.getElementById("loading");
	if (loadingEl)
		loadingEl.innerText = `Loading...\n(${text})`;
}

state.main = async function main() {
	if (/iPad|iPhone|iPod/.test(navigator.userAgent))
		document.getElementById("iosmessage").style.display = "block";
	state.loadStatus("loading profile");
	const hasProfile = state.initProfile();
	const startScreen = state.startScreen;
	if (hasProfile)
		startScreen.style.display = "none";
	else
		startScreen.showPopover();
	state.bottomNav.inert = true;
	state.categoryPickList.replaceChildren();
	state.defaultCategories.forEach(e => state.addPickableCategory(e));
	state.populateVoiceOptions();
	state.autoMatchVoiceForLang({ force: state.settings.voiceAutoMatched !== false });
	state.loadStatus("starting…");
	for (let i = 0; i < 500; i++) {
		if (window.swReg && (window.swReg == "err" || window.swReg?.active)) break;
		await new Promise(r => setTimeout(r, 10));
	}
	state.checkVersionAsync();
	state.feedReady = true;
	state.loadStatus("Ready");
	document.getElementById("loading")?.remove();
	state.startBtn.removeAttribute("disabled");
	state.categorySearchInput.removeAttribute("disabled");
	state.startBtn.innerText = "I'm an adult, continue";
	state.startBtn.onclick = async () => {
		state.bottomNav.inert = false;
		const checked = [...document.querySelectorAll(".categoryPicker>input:checked")];
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
		startScreen.hidePopover();
		startScreen.remove();
		setTimeout(state.saveProfile, 100);
		document.querySelector('meta[name="theme-color"]').setAttribute("content", "#000000");
		state.speechUnlocked = true;
		await state.startFeed();
	};
	state.initProfile();
	if (hasProfile) {
		state.bottomNav.inert = false;
		startScreen.remove();
		setTimeout(state.saveProfile, 100);
		document.querySelector('meta[name="theme-color"]').setAttribute("content", "#000000");
		await state.startFeed();
		state.tryUnlockSpeech();
	}
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
