import { state } from "./state.js";
import { basePath } from "./path.js";
state.loadSettings = function loadSettings() {
	const baseSettings = {
		storeData: true,
		openMainWiki: false,
		wikiLang: "simple",
		profile: "default",
		profiles: ["default"],
		theme: "theme-auto",
		muted: false,
		voiceURI: "",
		speechRate: 1,
		voiceAutoMatched: true,
	};
	const loadedSettings = JSON.parse(localStorage.getItem("tikipedia-settings") ?? '{}');
	const computedSettings = Object.assign(baseSettings, loadedSettings);
	if (!state.WIKI_LANGUAGES.some(l => l.code === computedSettings.wikiLang))
		computedSettings.wikiLang = "simple";
	document.querySelector(`#${computedSettings.theme}`).checked = true;
	document.getElementById("setting-storeData").checked = computedSettings.storeData;
	document.getElementById("setting-openMainWiki").checked = computedSettings.openMainWiki;
	const langEl = document.getElementById("setting-wikiLang");
	if (langEl) langEl.value = computedSettings.wikiLang;
	const rateEl = document.getElementById("setting-speechRate");
	if (rateEl) {
		rateEl.value = computedSettings.speechRate;
		document.getElementById("speechRateLabel").textContent = `${Number(computedSettings.speechRate).toFixed(1)}x`;
	}
	return computedSettings;
}

state.saveSettings = function saveSettings() {
	state.settings.theme = document.querySelector('[name=theme]:checked')?.id ?? "theme-auto";
	state.settings.storeData = document.getElementById("setting-storeData").checked;
	state.settings.openMainWiki = document.getElementById("setting-openMainWiki").checked;
	const langEl = document.getElementById("setting-wikiLang");
	if (langEl) state.settings.wikiLang = langEl.value || "simple";
	const voiceEl = document.getElementById("setting-voice");
	// Browsers load voices asynchronously; an unpopulated picker has no opinion yet,
	// so reading it here would wipe the stored preference on startup.
	if (voiceEl && voiceEl.dataset.ready) state.settings.voiceURI = voiceEl.value || "";
	const rateEl = document.getElementById("setting-speechRate");
	if (rateEl) {
		state.settings.speechRate = Number(rateEl.value) || 1;
		document.getElementById("speechRateLabel").textContent = `${state.settings.speechRate.toFixed(1)}x`;
	}
	localStorage.setItem("tikipedia-settings", JSON.stringify(state.settings));
}

state.getWikiLangInfo = function getWikiLangInfo(code) {
	const lang = code || state.settings?.wikiLang || "simple";
	return state.WIKI_LANGUAGES.find(l => l.code === lang) || state.WIKI_LANGUAGES[0];
}

state.wikiApiBase = function wikiApiBase(lang) {
	return `https://${lang || state.settings?.wikiLang || "simple"}.wikipedia.org/w/api.php`;
}

state.wikiSiteHost = function wikiSiteHost(lang) {
	return `${lang || state.settings?.wikiLang || "simple"}.wikipedia.org`;
}

state.resetAlgorithm = function resetAlgorithm() {
	if (!confirm(`Reset recommendations and stats for profile "${state.profileName}"?`))
		return;
	localStorage.removeItem(`tikipedia-profile-${state.settings.profile}`);
	state.loadProfile(state.settings.profile);
	document.location.reload();
}

state.resetEverything = async function resetEverything(autoConfirm) {
	if (!autoConfirm && !confirm("Are you sure you want to reset all data and settings?"))
		return;
	if (!autoConfirm && window.swReg && window.swReg !== "err") {
		await (await fetch(state.basePath("clearHtml"))).text();
		return window.swReg.unregister().then(e => state.resetEverything(true)).catch(e => state.resetEverything(true));
	}
	state.settings.profiles.forEach(e => state.deleteProfile(e));
	localStorage.removeItem("tikipedia-settings");
	document.location.reload();
}

state.initProfile = function initProfile() {
	if (!state.settings.storeData)
		return false;
	if (!state.settings.profiles.length)
		state.settings.profiles.push("default");
	if (!state.settings.profiles.includes(state.settings.profile))
		state.settings.profile = state.settings.profiles[0];
	return state.loadProfile(state.settings.profile);
}

state.defaultLangSlice = function defaultLangSlice() {
	return {
		categoryScores: {
		"given names": -1000,
			"surnames": -1000,
        },
	seenPosts: [],
		likedPosts: [],
			dislikedPosts: [],
    };
}

state.migrateProfileShape = function migrateProfileShape(raw) {
	if (raw?.byLang && typeof raw.byLang === "object")
		return raw;
	const slice = state.defaultLangSlice();
	if (raw?.categoryScores) slice.categoryScores = raw.categoryScores;
	if (Array.isArray(raw?.seenPosts)) slice.seenPosts = raw.seenPosts;
	if (Array.isArray(raw?.likedPosts)) slice.likedPosts = raw.likedPosts;
	if (Array.isArray(raw?.dislikedPosts)) slice.dislikedPosts = raw.dislikedPosts;
	const lang = state.settings?.wikiLang || "simple";
	return {
		profileName: raw?.profileName || "Default",
		timeSpentTotal: raw?.timeSpentTotal || 0,
		byLang: { [lang]: slice },
	};
}

state.profileStore = state.migrateProfileShape({});

state.applyLangSlice = function applyLangSlice() {
	const lang = state.settings?.wikiLang || "simple";
	if (!state.profileStore.byLang) state.profileStore.byLang = {};
	if (!state.profileStore.byLang[lang])
		state.profileStore.byLang[lang] = state.defaultLangSlice();
	const slice = state.profileStore.byLang[lang];
	state.categoryScores = slice.categoryScores || state.defaultLangSlice().categoryScores;
	state.seenPosts = slice.seenPosts || [];
	state.likedPosts = slice.likedPosts || [];
	state.dislikedPosts = slice.dislikedPosts || [];
	for (const page of state.pageCache.values()) page.seen = 0;
	const seenCounts = new Map();
	state.seenPosts.forEach(id => seenCounts.set(id, (seenCounts.get(id) || 0) + 1));
	seenCounts.forEach((count, id) => {
		const post = state.getPageById(id);
		if (post) post.seen = count;
	});
	state.likesLen = state.likedPosts.length;
}

state.persistLangSlice = function persistLangSlice() {
	const lang = state.settings?.wikiLang || "simple";
	if (!state.profileStore.byLang) state.profileStore.byLang = {};
	state.profileStore.byLang[lang] = {
		categoryScores: state.categoryScores,
		seenPosts: state.seenPosts,
		likedPosts: state.likedPosts,
		dislikedPosts: state.dislikedPosts,
	};
	state.profileStore.profileName = state.profileName;
	state.profileStore.timeSpentTotal = state.timeSpentTotal;
}

state.loadProfile = function loadProfile(profileId) {
	state.settings.profile = profileId;
	const loadedProfile = JSON.parse(localStorage.getItem(`tikipedia-profile-${profileId}`) ?? "{}");
	state.profileStore = state.migrateProfileShape(loadedProfile);
	state.profileName = state.profileStore.profileName || "Default";
	state.timeSpentTotal = state.profileStore.timeSpentTotal || 0;
	state.applyLangSlice();
	state.stopPlayback();
	if (state.activePostEl) state.stopImageSlideshow(state.activePostEl);
	state.activePostEl = null;
	state.activePostData = null;
	if (state.feedObserver) {
		state.feedObserver.disconnect();
		state.feedObserver = null;
	}
	const postsEl = document.querySelector(".posts");
	postsEl.querySelectorAll(".post").forEach(state.stopImageSlideshow);
	postsEl.innerHTML = "";
	postsEl.scrollTop = 0;
	state.candidateQueue.length = 0;
	state.likesLen = state.likedPosts.length;
	state.saveSettings();
	state.saveProfile();
	return !!state.seenPosts.length;
}

state.restartFeed = async function restartFeed() {
	const postsEl = state.postsRoot();
	if (!postsEl || !state.feedReady) return;
	state.candidateQueue.length = 0;
	await state.ensurePrefetch();
	const first = postsEl.querySelector(".post");
	if (first) {
		first.scrollIntoView({ block: "start" });
		state.setActivePost(first, true);
	}
}

state.saveProfile = function saveProfile() {
	if (!state.settings.storeData)
		return;
	state.persistLangSlice();
	localStorage.setItem(`tikipedia-profile-${state.settings.profile}`, JSON.stringify(state.profileStore));
}

state.addProfile = function addProfile(newProfileName) {
	const profileId = Math.random().toString(36).slice(2);
	localStorage.setItem(`tikipedia-profile-${profileId}`, JSON.stringify({ profileName: newProfileName }));
	state.settings.profiles.push(profileId);
	state.loadProfile(profileId);
	document.location.reload();
}

state.deleteProfile = function deleteProfile(profileId, skipInit) {
	localStorage.removeItem(`tikipedia-profile-${profileId}`);
	state.settings.profiles = state.settings.profiles.filter(e => e != profileId);
	if (profileId != state.settings.profile || skipInit)
		return;
	state.initProfile();
}

state.renderProfilesPage = function renderProfilesPage() {
	if (!state.profilesList) return;
	state.storeDataWarning.style.display = state.settings.storeData ? "none" : "block";
	state.profilesList.innerText = "";
	state.settings.profiles.forEach(profileId => {
		const displayName = JSON.parse(localStorage.getItem(`tikipedia-profile-${profileId}`) ?? "{}")?.profileName || profileId;
		const isCurrentProfile = profileId == state.settings.profile;
		const profileEntry = document.createElement("profile-entry");
		const deleteButton = document.createElement("button");
		profileEntry.innerText = displayName;
		if (isCurrentProfile)
			profileEntry.classList.add("current");
		profileEntry.setAttribute("tabindex", "0");
		profileEntry.setAttribute("role", "button");
		const loadThisProfile = () => {
			state.settings.profile = profileId;
			state.loadProfile(profileId);
			state.restartFeed();
			state.renderProfilesPage();
		};
		profileEntry.onclick = loadThisProfile;
		profileEntry.onkeydown = e => (e.keyCode == 13 || e.keyCode == 32) ? loadThisProfile(e) : true;
		deleteButton.innerText = "Delete";
		const deleteThisProfile = e => {
			e.stopPropagation();
			if (confirm(`Delete profile ${displayName}?`)) {
				state.deleteProfile(profileId);
				state.renderProfilesPage();
			}
		};
		deleteButton.onclick = deleteThisProfile;
		deleteButton.onkeydown = e => (e.keyCode == 13 || e.keyCode == 32) ? deleteThisProfile(e) : true;
		profileEntry.appendChild(deleteButton);
		state.profilesList.appendChild(profileEntry);
	});
	const addProfileButton = document.createElement("button");
	addProfileButton.innerText = "Add profile";
	addProfileButton.onclick = () => {
		const newProfileName = prompt("Profile name");
		if (newProfileName && newProfileName.length) {
			state.addProfile(newProfileName);
			state.renderProfilesPage();
		}
	};
	state.profilesList.appendChild(addProfileButton);
}

state.showProfilesModal = function showProfilesModal() {
	state.showProfilesPage();
}


export const resetAlgorithm = (...args) => state.resetAlgorithm(...args);
export const resetEverything = (...args) => state.resetEverything(...args);
