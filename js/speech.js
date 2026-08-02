import { state } from "./state.js";
state.getSelectedVoice = function getSelectedVoice() {
	if (!window.speechSynthesis || !state.settings?.voiceURI) return null;
	return speechSynthesis.getVoices().find(v => v.voiceURI === state.settings.voiceURI) || null;
}

state.voiceLangPrefix = function voiceLangPrefix(lang) {
	return (state.getWikiLangInfo(lang || state.settings?.wikiLang).bcp47 || "en").toLowerCase();
}

state.voiceMatchesWiki = function voiceMatchesWiki(voice, lang) {
	if (!voice?.lang) return false;
	const prefix = state.voiceLangPrefix(lang || state.settings?.wikiLang);
	const v = voice.lang.toLowerCase().replace(/_/g, "-");
	return v === prefix || v.startsWith(prefix + "-");
}

state.pickBestVoiceForLang = function pickBestVoiceForLang(lang) {
	lang = lang || state.settings?.wikiLang;
	if (!window.speechSynthesis) return null;
	const voices = speechSynthesis.getVoices().filter(v => state.voiceMatchesWiki(v, lang));
	if (!voices.length) return null;
	voices.sort((a, b) => {
		const aLocal = a.localService ? 0 : 1;
		const bLocal = b.localService ? 0 : 1;
		if (aLocal !== bLocal) return aLocal - bLocal;
		const aDef = a.default ? 0 : 1;
		const bDef = b.default ? 0 : 1;
		if (aDef !== bDef) return aDef - bDef;
		return (a.name || "").localeCompare(b.name || "");
	});
	return voices[0];
}

state.updateVoiceLangNote = function updateVoiceLangNote() {
	const note = document.getElementById("voiceLangNote");
	if (!note) return;
	const info = state.getWikiLangInfo();
	const match = state.pickBestVoiceForLang();
	if (match) {
		note.hidden = true;
		note.textContent = "";
	} else {
		note.hidden = false;
		note.textContent = `No ${info.label} voice installed on this device — using the system default with ${info.bcp47} language tag.`;
	}
}

state.autoMatchVoiceForLang = function autoMatchVoiceForLang({ force = false } = {}) {
	if (!window.speechSynthesis) return;
	if (!force && state.settings.voiceAutoMatched === false && state.settings.voiceURI) {
		state.updateVoiceLangNote();
		return;
	}
	const best = state.pickBestVoiceForLang();
	state.settings.voiceURI = best ? best.voiceURI : "";
	state.settings.voiceAutoMatched = true;
	const select = document.getElementById("setting-voice");
	if (select && select.dataset.ready)
		select.value = [...select.options].some(o => o.value === state.settings.voiceURI) ? state.settings.voiceURI : "";
	state.updateVoiceLangNote();
}

state.applyVoiceSettings = function applyVoiceSettings(utter, { rateMultiplier = 1 } = {}) {
	const voice = state.getSelectedVoice();
	if (voice) utter.voice = voice;
	utter.lang = state.getWikiLangInfo().bcp47 || "en";
	const base = Number(state.settings.speechRate) || 1;
	utter.rate = Math.min(2, Math.max(0.5, base * rateMultiplier));
	utter.volume = 1;
}

state.populateVoiceOptions = function populateVoiceOptions() {
	const select = document.getElementById("setting-voice");
	if (!select || !window.speechSynthesis) return;
	const prefix = state.voiceLangPrefix();
	const voices = speechSynthesis.getVoices()
		.slice()
		.sort((a, b) => {
			const aMatch = state.voiceMatchesWiki(a) ? 0 : 1;
			const bMatch = state.voiceMatchesWiki(b) ? 0 : 1;
			if (aMatch !== bMatch) return aMatch - bMatch;
			const aPref = a.lang.toLowerCase().startsWith(prefix) ? 0 : 1;
			const bPref = b.lang.toLowerCase().startsWith(prefix) ? 0 : 1;
			if (aPref !== bPref) return aPref - bPref;
			return (a.name || "").localeCompare(b.name || "");
		});
	const previous = state.settings.voiceURI || select.value || "";
	select.innerHTML = "";
	const defaultOpt = document.createElement("option");
	defaultOpt.value = "";
	defaultOpt.textContent = "Default system voice";
	select.appendChild(defaultOpt);
	voices.forEach(voice => {
		const opt = document.createElement("option");
		opt.value = voice.voiceURI;
		const tag = state.voiceMatchesWiki(voice) ? " ★" : "";
		opt.textContent = `${voice.name} (${voice.lang})${voice.default ? " — default" : ""}${tag}`;
		select.appendChild(opt);
	});
	if (voices.length) select.dataset.ready = "1";
	else delete select.dataset.ready;
	if (state.settings.voiceAutoMatched !== false && (!previous || !voices.some(v => v.voiceURI === previous)))
		state.autoMatchVoiceForLang({ force: true });
	const chosen = state.settings.voiceURI || previous;
	select.value = [...select.options].some(o => o.value === chosen) ? chosen : "";
	state.updateVoiceLangNote();
}

state.previewSelectedVoice = function previewSelectedVoice() {
	if (!window.speechSynthesis) return;
	state.speechUnlocked = true;
	delete state.tapToPlay?.dataset?.show;
	speechSynthesis.cancel();
	const sample = state.getWikiLangInfo().preview || "Hello from Tikipedia.";
	const utter = new SpeechSynthesisUtterance(sample);
	state.applyVoiceSettings(utter);
	speechSynthesis.speak(utter);
}

state.onVoiceSettingsChanged = function onVoiceSettingsChanged() {
	state.settings.voiceAutoMatched = false;
	state.saveSettings();
	state.updateVoiceLangNote();
	if (state.activePostEl && state.activePostData && !state.settings.muted && !document.hidden)
		state.speakPost(state.activePostEl, state.activePostData, { restart: true });
}

/** Switch Wikipedia language. Optionally skip feed restart (deep links / search). */
state.setWikiLang = async function setWikiLang(next, { restartFeed = true } = {}) {
	next = state.normalizeWikiLang ? state.normalizeWikiLang(next) : (next || "simple");
	if (next === state.settings.wikiLang) return false;
	state.persistLangSlice();
	state.settings.wikiLang = next;
	state.settings.voiceAutoMatched = true;
	state.saveSettings();
	state.applyLangSlice();
	state.clearLiveCaches();
	state.stopPlayback();
	if (state.activePostEl) state.stopImageSlideshow(state.activePostEl);
	state.activePostEl = null;
	state.activePostData = null;
	const postsEl = state.postsRoot();
	if (postsEl) {
		postsEl.querySelectorAll(".post").forEach(state.stopImageSlideshow);
		postsEl.innerHTML = "";
		postsEl.scrollTop = 0;
	}
	if (state.wikiLangSelect) state.wikiLangSelect.value = next;
	state.autoMatchVoiceForLang({ force: true });
	state.populateVoiceOptions();
	state.feedReady = true;
	if (restartFeed) {
		// Drop any /p/{lang}/… deep link so startFeed doesn't reopen the old edition.
		try {
			history.replaceState({ appPage: "foryou" }, "", state.appPagePath("foryou"));
		} catch { /* ignore */ }
		state.loadStatus("Fetching shorts…");
		await state.ensurePrefetch();
		state.startFeed();
	}
	setTimeout(state.saveProfile, 100);
	return true;
};

state.onWikiLangChanged = async function onWikiLangChanged() {
	const langEl = document.getElementById("setting-wikiLang");
	const next = langEl?.value || "simple";
	await state.setWikiLang(next, { restartFeed: true });
}

state.stopCaptionTimer = function stopCaptionTimer() {
	if (state.captionTimer) {
		clearTimeout(state.captionTimer);
		state.captionTimer = null;
	}
}

// Tokens like "1928-1938" or "Constantinople" take far longer to say than one plain word.
state.captionWordWeight = function captionWordWeight(raw) {
	const token = (raw || "").trim();
	if (!token) return 1;
	const digits = (token.match(/\d/g) || []).length;
	const letters = token.replace(/[^A-Za-z]/g, "").length;
	let weight = 1 + digits * 0.55 + Math.max(0, letters - 6) * 0.08;
	if (digits >= 4 && /[-–—/]/.test(token))
		weight += 0.8;
	return Math.min(weight, 6);
}

// Maps a speech charIndex to the caption token containing it, so mid-token
// boundary events (common inside dates and numbers) don't skip ahead.
state.tokenIndexAtChar = function tokenIndexAtChar(spans, charIndex) {
	let lo = 0;
	let hi = spans.length - 1;
	let found = 0;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (spans[mid] <= charIndex) {
			found = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found;
}

state.stopPlayback = function stopPlayback() {
	state.stopCaptionTimer();
	if (window._shortLoopTimer) {
		clearTimeout(window._shortLoopTimer);
		window._shortLoopTimer = null;
	}
	// Cleared first so the cancelled utterance's onend/onerror handlers no-op.
	state.currentUtterance = null;
	state.usingBoundarySync = false;
	if (window.speechSynthesis)
		speechSynthesis.cancel();
}

state.resetCaptionStyles = function resetCaptionStyles(words) {
	words.forEach(w => {
		w.classList.remove("active", "spoken");
		w.style.removeProperty("--cap-color");
	});
}

state.highlightCaptionWord = function highlightCaptionWord(index) {
	if (!state.captionWords.length) return;
	const i = Math.max(0, Math.min(index, state.captionWords.length - 1));
	state.captionWords.forEach((w, idx) => {
		w.classList.toggle("spoken", idx < i);
		w.classList.toggle("active", idx === i);
		if (idx === i) {
			const role = w.dataset.capRole || "other";
			w.style.setProperty("--cap-color", state.CAP_ROLE_COLORS[role] || state.CAP_ROLE_COLORS.other);
		}
	});
	state.captionIndex = i;
	if (state.activePostEl) {
		const progress = state.activePostEl.querySelector(".playbackProgress");
		if (progress) {
			const value = state.captionWords.length > 1
				? (i / (state.captionWords.length - 1)) * 100
				: 100;
			progress.style.setProperty("--progress", `${value}%`);
			progress.setAttribute("aria-valuenow", String(Math.round(value)));
		}
		state.syncCaptionLinkedImage(state.activePostEl, state.captionWords[i]);
	}
}

state.startTimedCaptions = function startTimedCaptions(words, rate, fromIndex = 0) {
	state.stopCaptionTimer();
	if (!words.length) return;
	const msPerWord = Math.max(120, 280 / (rate || 1));
	let i = Math.max(0, Math.min(fromIndex, words.length - 1));
	state.highlightCaptionWord(i);
	const step = () => {
		i++;
		if (i >= words.length) {
			state.stopCaptionTimer();
			state.highlightCaptionWord(words.length - 1);
			// Muted / no-TTS path has no utterance.onend, so loop from here.
			if (state.settings.muted || !state.speechUnlocked || !window.speechSynthesis)
				state.scheduleShortLoop();
			return;
		}
		state.highlightCaptionWord(i);
		state.captionTimer = setTimeout(step, msPerWord * state.captionWordWeight(words[i].textContent));
	};
	state.captionTimer = setTimeout(step, msPerWord * state.captionWordWeight(words[i].textContent));
}

state.canLoopCurrentShort = function canLoopCurrentShort() {
	return !!(
		state.activePostEl &&
		state.activePostData &&
		!state.playbackPaused &&
		!document.hidden &&
		!state.appPageIsOpen() &&
		!state.descriptionSheet?.open
	);
}

state.scheduleShortLoop = function scheduleShortLoop(delayMs = 400) {
	if (window._shortLoopTimer) {
		clearTimeout(window._shortLoopTimer);
		window._shortLoopTimer = null;
	}
	window._shortLoopTimer = setTimeout(() => {
		window._shortLoopTimer = null;
		state.loopCurrentShort();
	}, delayMs);
}

state.loopCurrentShort = function loopCurrentShort() {
	if (!state.canLoopCurrentShort()) return;
	const postEl = state.activePostEl;
	const post = state.activePostData;
	postEl._showingLink = null;
	postEl._slideIndex = 0;
	const visual = postEl.querySelector(".visual");
	if (visual) state.showSlideImage(visual, 0);
	state.speakPost(postEl, post, { restart: true });
	state.startImageSlideshow(postEl);
}

state.setPausedUi = function setPausedUi(postEl, paused) {
	if (!postEl) return;
	const wasPaused = !!postEl.dataset.paused;
	const icon = postEl.querySelector(".pauseIcon");
	if (paused) {
		postEl.dataset.paused = "1";
		if (icon) {
			delete icon.dataset.flash;
			state.setIconImg(icon, "pause", "overlayIcon");
		}
		return;
	}
	delete postEl.dataset.paused;
	if (!icon || !wasPaused) return;
	// Brief play-glyph flash so resuming gets the same feedback as pausing.
	state.setIconImg(icon, "play", "overlayIcon");
	delete icon.dataset.flash;
	void icon.offsetWidth;
	icon.dataset.flash = "1";
}

// Speaks from a caption word index so pause/resume and speed changes can restart cleanly.
state.speakFrom = function speakFrom(postEl, post, startIndex) {
	if (!postEl || !post) return;
	const words = [...postEl.querySelectorAll(".caption-word")];
	state.captionWords = words;
	const baseIndex = words.length ? Math.max(0, Math.min(startIndex, words.length - 1)) : 0;
	state.stopPlayback();
	state.resetCaptionStyles(words);
	state.highlightCaptionWord(baseIndex);

	if (state.settings.muted || !window.speechSynthesis) {
		state.startTimedCaptions(words, state.playbackRate, baseIndex);
		return;
	}
	if (!state.speechUnlocked) {
		state.tapToPlay.dataset.show = "1";
		state.startTimedCaptions(words, state.playbackRate, baseIndex);
		return;
	}

	const spoken = words.slice(baseIndex).map(w => {
		if (w.dataset.speak != null) return w.dataset.speak;
		return w.textContent;
	});
	const text = spoken.join("").trim() || state.toSpeechText(post.text);
	// Character offset where each caption token starts inside `text`.
	const tokenStarts = [];
	let cursor = 0;
	for (const raw of spoken) {
		tokenStarts.push(cursor);
		cursor += raw.length;
	}
	const utter = new SpeechSynthesisUtterance(text);
	state.applyVoiceSettings(utter, { rateMultiplier: state.playbackRate === 1 ? 1 : state.playbackRate });
	state.currentUtterance = utter;
	state.usingBoundarySync = false;

	utter.onboundary = (ev) => {
		if (ev.name && ev.name !== "word") return;
		state.usingBoundarySync = true;
		state.stopCaptionTimer();
		const offset = tokenStarts.length
			? state.tokenIndexAtChar(tokenStarts, ev.charIndex || 0)
			: 0;
		state.highlightCaptionWord(baseIndex + offset);
	};
	utter.onend = () => {
		if (state.currentUtterance !== utter) return;
		state.currentUtterance = null;
		state.stopCaptionTimer();
		if (words.length)
			state.highlightCaptionWord(words.length - 1);
		if (state.activePostEl === postEl)
			state.scheduleShortLoop();
	};
	utter.onerror = () => {
		if (state.currentUtterance !== utter) return;
		state.currentUtterance = null;
		if (!state.usingBoundarySync)
			state.startTimedCaptions(words, state.playbackRate, baseIndex);
	};

	speechSynthesis.speak(utter);
	// Fallback if boundary events never fire
	setTimeout(() => {
		if (state.currentUtterance === utter && !state.usingBoundarySync && !state.playbackPaused && !state.settings.muted)
			state.startTimedCaptions(words, state.playbackRate, baseIndex);
	}, 400);
}

state.speakPost = function speakPost(postEl, post, { restart = true } = {}) {
	state.playbackPaused = false;
	state.setPausedUi(postEl, false);
	state.speakFrom(postEl, post, restart ? 0 : state.captionIndex);
}

// speechSynthesis.pause() is unreliable across browsers, so stop and remember the word instead.
state.pausePlayback = function pausePlayback() {
	if (state.playbackPaused) return;
	state.playbackPaused = true;
	state.stopCaptionTimer();
	state.stopPlayback();
	state.setPausedUi(state.activePostEl, true);
}

state.resumePlayback = function resumePlayback() {
	state.playbackPaused = false;
	state.setPausedUi(state.activePostEl, false);
	if (!state.activePostEl || !state.activePostData) return;
	if (!state.speechUnlocked && !state.settings.muted) {
		state.tapToPlay.dataset.show = "1";
		return;
	}
	state.speakFrom(state.activePostEl, state.activePostData, state.captionIndex);
}

state.togglePause = function togglePause() {
	if (state.playbackPaused) state.resumePlayback();
	else state.pausePlayback();
}

state.setMuted = function setMuted(muted) {
	state.settings.muted = !!muted;
	state.saveSettings();
	document.querySelectorAll(".muteBtn").forEach(btn => {
		if (muted) btn.dataset.muted = "1";
		else delete btn.dataset.muted;
		if (btn._actionLabel) btn._actionLabel.textContent = muted ? "Muted" : "Sound";
		state.setIconImg(btn, muted ? "volume-mute" : "volume");
	});
	if (!state.activePostEl || !state.activePostData || state.playbackPaused) return;
	state.speakFrom(state.activePostEl, state.activePostData, state.captionIndex);
}

state.CAP_ARTICLES = new Set(["a", "an", "the"]);
state.CAP_PREPOSITIONS = new Set([
	"in", "on", "at", "to", "for", "of", "with", "by", "from", "as", "into", "about", "than",
	"over", "after", "before", "between", "under", "through", "during", "without", "within",
	"along", "across", "behind", "beyond", "against", "among", "around", "beside", "besides",
	"except", "inside", "outside", "near", "off", "onto", "toward", "towards", "upon", "via",
	"per", "plus", "versus", "vs", "like", "unlike", "since", "until", "till", "up", "down", "out",
]);
state.CAP_PRONOUNS = new Set([
	"i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your",
	"his", "its", "our", "their", "mine", "yours", "hers", "ours", "theirs", "myself", "yourself",
	"himself", "herself", "itself", "ourselves", "themselves", "this", "that", "these", "those",
	"who", "whom", "whose", "which", "what", "whoever", "whichever", "whatever", "someone",
	"somebody", "something", "anyone", "anybody", "anything", "everyone", "everybody", "everything",
	"no one", "nobody", "nothing", "one", "ones", "another", "other", "others", "each", "every",
	"either", "neither", "both", "few", "many", "much", "most", "some", "any", "all", "several",
]);
state.CAP_CONJUNCTIONS = new Set([
	"and", "or", "but", "nor", "so", "yet", "because", "although", "though", "while", "whereas",
	"if", "unless", "until", "when", "whenever", "where", "wherever", "whether", "once", "since",
	"after", "before", "than", "that", "as", "also", "then", "thus", "hence", "therefore",
]);
state.CAP_VERBS = new Set([
	"is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "done", "doing",
	"have", "has", "had", "having", "can", "could", "will", "would", "shall", "should", "may",
	"might", "must", "need", "needs", "needed", "seem", "seems", "seemed", "become", "becomes",
	"became", "make", "makes", "made", "making", "get", "gets", "got", "getting", "go", "goes",
	"went", "gone", "going", "come", "comes", "came", "coming", "take", "takes", "took", "taken",
	"taking", "see", "sees", "saw", "seen", "seeing", "know", "knows", "knew", "known", "knowing",
	"think", "thinks", "thought", "thinking", "look", "looks", "looked", "looking", "want", "wants",
	"wanted", "wanting", "give", "gives", "gave", "given", "giving", "use", "uses", "used", "using",
	"find", "finds", "found", "finding", "tell", "tells", "told", "telling", "ask", "asks", "asked",
	"asking", "work", "works", "worked", "working", "call", "calls", "called", "calling", "try",
	"tries", "tried", "trying", "leave", "leaves", "left", "leaving", "put", "puts", "putting",
	"mean", "means", "meant", "meaning", "keep", "keeps", "kept", "keeping", "let", "lets", "letting",
	"begin", "begins", "began", "begun", "beginning", "show", "shows", "showed", "shown", "showing",
	"hear", "hears", "heard", "hearing", "play", "plays", "played", "playing", "run", "runs", "ran",
	"running", "move", "moves", "moved", "moving", "live", "lives", "lived", "living", "believe",
	"believes", "believed", "believing", "hold", "holds", "held", "holding", "bring", "brings",
	"brought", "bringing", "happen", "happens", "happened", "happening", "write", "writes", "wrote",
	"written", "writing", "sit", "sits", "sat", "sitting", "stand", "stands", "stood", "standing",
	"lose", "loses", "lost", "losing", "pay", "pays", "paid", "paying", "meet", "meets", "met",
	"meeting", "include", "includes", "included", "including", "continue", "continues", "continued",
	"continuing", "set", "sets", "setting", "learn", "learns", "learned", "learnt", "learning",
	"change", "changes", "changed", "changing", "lead", "leads", "led", "leading", "understand",
	"understands", "understood", "understanding", "watch", "watches", "watched", "watching", "follow",
	"follows", "followed", "following", "stop", "stops", "stopped", "stopping", "create", "creates",
	"created", "creating", "speak", "speaks", "spoke", "spoken", "speaking", "read", "reads", "reading",
	"allow", "allows", "allowed", "allowing", "add", "adds", "added", "adding", "spend", "spends",
	"spent", "spending", "grow", "grows", "grew", "grown", "growing", "open", "opens", "opened",
	"opening", "walk", "walks", "walked", "walking", "win", "wins", "won", "winning", "offer",
	"offers", "offered", "offering", "remember", "remembers", "remembered", "remembering", "love",
	"loves", "loved", "loving", "consider", "considers", "considered", "considering", "appear",
	"appears", "appeared", "appearing", "buy", "buys", "bought", "buying", "wait", "waits", "waited",
	"waiting", "serve", "serves", "served", "serving", "die", "dies", "died", "dying", "send",
	"sends", "sent", "sending", "build", "builds", "built", "building", "stay", "stays", "stayed",
	"staying", "fall", "falls", "fell", "fallen", "falling", "cut", "cuts", "cutting", "reach",
	"reaches", "reached", "reaching", "kill", "kills", "killed", "killing", "remain", "remains",
	"remained", "remaining", "suggest", "suggests", "suggested", "suggesting", "raise", "raises",
	"raised", "raising", "pass", "passes", "passed", "passing", "sell", "sells", "sold", "selling",
	"require", "requires", "required", "requiring", "report", "reports", "reported", "reporting",
	"decide", "decides", "decided", "deciding", "pull", "pulls", "pulled", "pulling", "return",
	"returns", "returned", "returning", "explain", "explains", "explained", "explaining", "hope",
	"hopes", "hoped", "hoping", "develop", "develops", "developed", "developing", "carry", "carries",
	"carried", "carrying", "break", "breaks", "broke", "broken", "breaking", "receive", "receives",
	"received", "receiving", "agree", "agrees", "agreed", "agreeing", "support", "supports",
	"supported", "supporting", "hit", "hits", "hitting", "produce", "produces", "produced",
	"producing", "eat", "eats", "ate", "eaten", "eating", "cover", "covers", "covered", "covering",
	"catch", "catches", "caught", "catching", "draw", "draws", "drew", "drawn", "drawing", "choose",
	"chooses", "chose", "chosen", "choosing", "describe", "describes", "described", "describing",
	"contain", "contains", "contained", "containing", "exist", "exists", "existed", "existing",
	"form", "forms", "formed", "forming", "provide", "provides", "provided", "providing", "start",
	"starts", "started", "starting", "help", "helps", "helped", "helping", "name", "names", "named",
	"naming", "say", "says", "said", "saying", "born", "founded", "located", "called", "known",
]);
state.CAP_ADJECTIVES = new Set([
	"new", "old", "good", "great", "big", "small", "large", "little", "long", "short", "high",
	"low", "early", "late", "young", "important", "different", "same", "own", "other", "next",
	"last", "first", "second", "third", "best", "better", "worst", "worse", "free", "full", "hard",
	"easy", "sure", "clear", "true", "false", "real", "right", "left", "wrong", "main", "only",
	"public", "private", "local", "national", "international", "political", "social", "human",
	"natural", "special", "strong", "weak", "black", "white", "red", "blue", "green", "yellow",
	"dark", "light", "hot", "cold", "warm", "cool", "open", "closed", "alive", "dead", "famous",
	"popular", "common", "rare", "simple", "complex", "modern", "ancient", "religious", "military",
	"economic", "cultural", "scientific", "medical", "legal", "official", "original", "final",
	"possible", "available", "similar", "various", "certain", "general", "personal", "major",
	"minor", "whole", "entire", "single", "double", "multiple", "british", "american", "english",
	"french", "german", "chinese", "japanese", "indian", "european", "african", "asian", "roman",
	"greek", "russian", "spanish", "italian", "canadian", "australian", "huge", "tiny", "wide",
	"narrow", "deep", "thick", "thin", "heavy", "fast", "slow", "quick", "beautiful", "ugly",
	"happy", "sad", "poor", "rich", "safe", "dangerous", "useful", "famous", "unknown", "famous",
]);
state.CAP_ADVERBS = new Set([
	"not", "also", "very", "just", "even", "still", "already", "always", "never", "often",
	"sometimes", "usually", "really", "only", "almost", "enough", "quite", "rather", "too",
	"so", "then", "now", "here", "there", "away", "back", "again", "once", "twice", "together",
	"alone", "else", "ever", "ago", "soon", "later", "early", "well", "badly", "fast", "slowly",
	"quickly", "suddenly", "finally", "actually", "probably", "perhaps", "maybe", "certainly",
	"especially", "generally", "mainly", "mostly", "nearly", "simply", "clearly", "directly",
	"exactly", "highly", "largely", "recently", "currently", "originally", "previously", "later",
	"earlier", "today", "tomorrow", "yesterday", "tonight", "forward", "backward", "upstairs",
	"downstairs", "outside", "inside", "nearby", "far", "apart", "instead", "otherwise",
]);
state.CAP_MONTHS = new Set([
	"january", "february", "march", "april", "may", "june", "july", "august", "september",
	"october", "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep",
	"sept", "oct", "nov", "dec",
]);
state.CAP_WEEKDAYS = new Set([
	"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
	"mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
]);

state.classifyCaptionToken = function classifyCaptionToken(raw, { isLinked = false, isFirst = false } = {}) {
	if (isLinked) return "link";
	const token = state.normalizeCaptionToken(raw);
	if (!token) return "other";
	if (state.CAP_MONTHS.has(token) || state.CAP_WEEKDAYS.has(token)) return "date";
	if (/^\d{1,4}(st|nd|rd|th)?$/.test(token) && token.length >= 3 && /^\d{3,4}/.test(token))
		return "date";
	if (/^\d{1,4}[-–—/]\d{1,4}$/.test(token) || /^\d{4}s$/.test(token))
		return "date";
	if (/^\d/.test(token) || /[%$€£]/.test(raw))
		return "number";
	if (state.CAP_ARTICLES.has(token)) return "article";
	if (state.CAP_PREPOSITIONS.has(token)) return "preposition";
	if (state.CAP_PRONOUNS.has(token)) return "pronoun";
	if (state.CAP_CONJUNCTIONS.has(token)) return "conjunction";
	if (state.CAP_VERBS.has(token)) return "verb";
	if (state.CAP_ADVERBS.has(token) || (token.length > 3 && token.endsWith("ly") && !state.CAP_ADJECTIVES.has(token)))
		return "adverb";
	if (state.CAP_ADJECTIVES.has(token)) return "adjective";
	// Capitalized content words (not sentence start) lean proper-noun → noun
	const surface = String(raw || "").trim();
	if (!isFirst && /^[A-Z]/.test(surface) && token.length > 1) return "noun";
	if (token.endsWith("ing") || token.endsWith("ed")) return "verb";
	return "noun";
}

state.applyCaptionRoles = function applyCaptionRoles(spans) {
	spans.forEach((span, i) => {
		const role = state.classifyCaptionToken(span.textContent, {
			isLinked: !!span.dataset.linkId,
			isFirst: i === 0,
		});
		span.dataset.capRole = role;
		span.style.setProperty("--cap-color", state.CAP_ROLE_COLORS[role] || state.CAP_ROLE_COLORS.other);
	});
}

state.under100 = function under100(n) {
	if (n < 10) return state.ONES[n];
	if (n < 20) return state.TEENS[n - 10];
	const t = Math.floor(n / 10);
	const o = n % 10;
	return o ? `${TENS[t]}-${ONES[o]}` : state.TENS[t];
}

state.speakYearEn = function speakYearEn(year) {
	const y = Number(year);
	if (!Number.isFinite(y) || y < 0) return String(year);
	if (y < 1000) return state.under100(y) || String(y);
	if (y >= 2000 && y <= 2009) return y === 2000 ? "two thousand" : `two thousand ${ONES[y % 10]}`;
	if (y >= 2010 && y <= 2099) {
		const rest = y % 100;
		return rest < 10 ? `two thousand ${ONES[rest]}` : `twenty ${under100(rest)}`;
	}
	const century = Math.floor(y / 100);
	const rest = y % 100;
	let head;
	if (century >= 10 && century <= 19) head = state.under100(century);
	else if (century >= 20 && century <= 99) head = state.under100(century);
	else head = String(century);
	if (rest === 0) return `${head} hundred`;
	if (rest < 10) return `${head} oh ${ONES[rest]}`;
	return `${head} ${under100(rest)}`;
}

state.speakDecadeEn = function speakDecadeEn(token) {
	const m = String(token).match(/^(\d{3,4})s$/i);
	if (!m) return null;
	const base = Number(m[1]);
	if (base % 10 !== 0) return null;
	if (base % 100 === 0) return `${speakYearEn(base)}s`.replace(/ hundred$/, " hundreds");
	const spoken = state.speakYearEn(base);
	if (spoken.endsWith("ty")) return `${spoken.slice(0, -1)}ies`;
	return `${spoken}s`;
}

state.isEnglishSpeechLang = function isEnglishSpeechLang() {
	const code = state.settings.wikiLang || "simple";
	return code === "en" || code === "simple";
}

state.stripTrailingPunct = function stripTrailingPunct(token) {
	const m = String(token).match(/^(.*?)([.,;:!?]+)?$/);
	return { core: m?.[1] ?? token, punct: m?.[2] || "" };
}

state.isMonthToken = function isMonthToken(token) {
	const core = state.stripTrailingPunct(token).core.toLowerCase().replace(/\.$/, "");
	return state.MONTH_NAMES_EN.includes(core) || state.MONTH_NAMES_EN.some(m => m.startsWith(core) && core.length >= 3);
}

state.isDateContext = function isDateContext(tokens, index) {
	const prev = state.stripTrailingPunct(tokens[index - 1] || "").core.toLowerCase();
	const next = state.stripTrailingPunct(tokens[index + 1] || "").core.toLowerCase();
	if (state.isMonthToken(tokens[index - 1] || "") || state.isMonthToken(tokens[index + 1] || "")) return true;
	if (/^(c|ca|bc|ad|bce|ce|r)$/i.test(prev) || /^(bc|ad|bce|ce)$/i.test(next)) return true;
	if (/^(born|died|in|since|until|from|year|years)$/i.test(prev)) return true;
	if (/[–—-]/.test(tokens[index] || "")) return true;
	return false;
}

state.normalizeEraToken = function normalizeEraToken(core) {
	const t = core.toLowerCase().replace(/\.$/, "");
	if (t === "c" || t === "ca") return "circa";
	if (t === "bc") return "B C";
	if (t === "ad") return "A D";
	if (t === "bce") return "B C E";
	if (t === "ce") return "C E";
	if (t === "r") return "reigned";
	return null;
}

state.speakYearRange = function speakYearRange(token, lang) {
	const m = String(token).match(/^(\d{3,4})\s*[–—-]\s*(\d{2,4})([.,;:!?]*)$/);
	if (!m) return null;
	let a = Number(m[1]);
	let b = Number(m[2]);
	if (m[2].length <= 2) b = Math.floor(a / 100) * 100 + b;
	const connector = state.RANGE_CONNECTORS[lang] || state.RANGE_CONNECTORS[state.getWikiLangInfo(lang).bcp47] || ",";
	if (state.isEnglishSpeechLang())
		return `${speakYearEn(a)} ${connector} ${speakYearEn(b)}${m[3] || ""}`;
	return `${a} ${connector} ${b}${m[3] || ""}`;
}

state.tokenSpeechForm = function tokenSpeechForm(tokens, index) {
	const raw = tokens[index];
	const { core, punct } = state.stripTrailingPunct(raw);
	const lang = state.settings.wikiLang || "simple";
	const range = state.speakYearRange(raw, lang);
	if (range) return range;

	const era = state.normalizeEraToken(core);
	if (era) return era + (punct ? `${punct} ` : " ");

	if (state.isEnglishSpeechLang()) {
		const decade = state.speakDecadeEn(core);
		if (decade && state.isDateContext(tokens, index))
			return `${decade}${punct || ""} `;

		if (/^\d{3,4}$/.test(core) && state.isDateContext(tokens, index))
			return `${speakYearEn(core)}${punct || ""} `;

		// Month D, YYYY  /  Month D YYYY
		if (state.isMonthToken(core)) {
			const dayTok = tokens[index + 1];
			const yearTok = tokens[index + 2];
			const day = state.stripTrailingPunct(dayTok || "").core.replace(/,/g, "");
			const year = state.stripTrailingPunct(yearTok || "").core;
			if (/^\d{1,2}$/.test(day) && /^\d{3,4}$/.test(year)) {
				const ord = state.ORDINAL_WORDS[Number(day)] || day;
				return `${core} ${ord}, ${speakYearEn(year)} `;
			}
			if (/^\d{1,2}$/.test(day)) {
				const ord = state.ORDINAL_WORDS[Number(day)] || day;
				return `${core} ${ord}${state.stripTrailingPunct(dayTok).punct || ""} `;
			}
		}

		// D Month YYYY
		if (/^\d{1,2}$/.test(core) && state.isMonthToken(tokens[index + 1] || "")) {
			const month = state.stripTrailingPunct(tokens[index + 1]).core;
			const yearTok = tokens[index + 2];
			const year = state.stripTrailingPunct(yearTok || "").core;
			const ord = state.ORDINAL_WORDS[Number(core)] || core;
			if (/^\d{3,4}$/.test(year))
				return `${ord} of ${month} ${speakYearEn(year)} `;
			return `${ord} of ${month}${punct || ""} `;
		}
	} else {
		// Non-English: structural range already handled; leave numbers alone.
		if (/^\d{3,4}$/.test(core) && /[–—-]/.test(raw))
			return state.speakYearRange(raw, lang) || raw;
	}
	return null;
}

state.annotateSpeechTokens = function annotateSpeechTokens(spans) {
	const display = spans.map(s => s.textContent);
	const spoken = display.map(t => t);
	/** @type {Map<number, number[]>} lead index → indices merged into it (including lead) */
	const mergeGroups = new Map();
	const consumed = new Set();

	const markMerge = (lead, extras) => {
		const group = [lead, ...extras];
		mergeGroups.set(lead, group);
		for (const idx of extras) consumed.add(idx);
	};

	for (let i = 0; i < display.length; i++) {
		if (consumed.has(i)) continue;
		const form = state.tokenSpeechForm(display, i);
		if (!form) continue;
		spoken[i] = form.endsWith(" ") ? form : `${form} `;

		// Collapse multi-token date phrases into the first token for speech + karaoke.
		if (state.isEnglishSpeechLang() && state.isMonthToken(state.stripTrailingPunct(display[i]).core)) {
			const day = state.stripTrailingPunct(display[i + 1] || "").core.replace(/,/g, "");
			const year = state.stripTrailingPunct(display[i + 2] || "").core;
			if (/^\d{1,2}$/.test(day)) {
				const extras = [i + 1];
				if (/^\d{3,4}$/.test(year)) extras.push(i + 2);
				markMerge(i, extras);
			}
		} else if (
			state.isEnglishSpeechLang()
			&& /^\d{1,2}$/.test(state.stripTrailingPunct(display[i]).core)
			&& state.isMonthToken(display[i + 1] || "")
		) {
			const extras = [i + 1];
			const year = state.stripTrailingPunct(display[i + 2] || "").core;
			if (/^\d{3,4}$/.test(year)) extras.push(i + 2);
			markMerge(i, extras);
		}
	}

	// Merge collapsed date tokens into one visible caption word (karaoke shows
	// "January 15, 1990" while TTS speaks the expanded form).
	for (const [lead, group] of mergeGroups) {
		const span = spans[lead];
		if (!span) continue;
		const merged = group.map(idx => display[idx].trim()).filter(Boolean).join(" ");
		const trail = group.some(idx => /\s$/.test(display[idx])) || lead < spans.length - 1;
		span.textContent = trail && !/\s$/.test(merged) ? `${merged} ` : merged;
		span.dataset.capRole = "date";
		span.style.setProperty("--cap-color", state.CAP_ROLE_COLORS.date || state.CAP_ROLE_COLORS.other);
	}

	spans.forEach((span, i) => {
		if (consumed.has(i)) return;
		const displayText = span.textContent;
		const speakText = spoken[i];
		if (speakText !== displayText)
			span.dataset.speak = speakText;
		else
			delete span.dataset.speak;
	});

	// Drop consumed day/year spans so boundary sync can't land on blank words.
	for (let i = spans.length - 1; i >= 0; i--) {
		if (!consumed.has(i)) continue;
		spans[i].remove();
		spans.splice(i, 1);
	}
}

state.toSpeechText = function toSpeechText(text) {
	const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return "";
	const fakeSpans = parts.map(p => {
		const span = document.createElement("span");
		span.textContent = p + " ";
		return span;
	});
	state.annotateSpeechTokens(fakeSpans);
	return fakeSpans.map(s => s.dataset.speak != null ? s.dataset.speak : s.textContent).join("").trim();
}

state.buildCaptionWords = function buildCaptionWords(container, text, post) {
	container.innerHTML = "";
	const parts = text.trim().split(/\s+/).filter(Boolean);
	parts.forEach((word, i) => {
		const span = document.createElement("span");
		span.className = "caption-word";
		span.textContent = word + (i < parts.length - 1 ? " " : "");
		container.appendChild(span);
	});
	const spans = [...container.querySelectorAll(".caption-word")];
	if (post) state.tagCaptionLinkWords(spans, post);
	state.applyCaptionRoles(spans);
	state.annotateSpeechTokens(spans);
	return spans;
}

state.normalizeCaptionToken = function normalizeCaptionToken(raw) {
	return String(raw || "").toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

// Mark caption spans that form an in-summary wiki link so the visual can
// show that article's picture while the linked words are spoken.
state.tagCaptionLinkWords = function tagCaptionLinkWords(spans, post) {
	const related = state.findRelatedInSummary(post);
	post._relatedInSummary = related;
	if (!related.length) return related;
	const tokens = spans.map(s => state.normalizeCaptionToken(s.textContent));
	const assigned = new Array(spans.length).fill(null);
	// Longer labels first so "Spanish Cup" wins over shorter fragments.
	const ordered = [...related].sort((a, b) =>
		String(b.label || b.title || "").length - String(a.label || a.title || "").length
	);
	for (const rel of ordered) {
		const phrases = [...new Set([
			rel.label,
			rel.title,
			...(rel.page?.aliases || []),
		].filter(Boolean))];
		phrases.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
		for (const phrase of phrases) {
			const titleParts = phrase.split(/\s+/).map(state.normalizeCaptionToken).filter(Boolean);
			if (!titleParts.length) continue;
			for (let i = 0; i <= tokens.length - titleParts.length; i++) {
				let ok = true;
				for (let j = 0; j < titleParts.length; j++) {
					if (assigned[i + j] || tokens[i + j] !== titleParts[j]) {
						ok = false;
						break;
					}
				}
				if (!ok) continue;
				const linkId = String(rel.id || rel.page?.id || "");
				if (!linkId) continue;
				for (let j = 0; j < titleParts.length; j++) {
					assigned[i + j] = rel;
					spans[i + j].dataset.linkId = linkId;
					spans[i + j].dataset.linkTitle = rel.title;
					spans[i + j].classList.add("caption-link");
				}
			}
		}
	}
	return related;
}


export const annotateSpeechTokens = (...args) => state.annotateSpeechTokens(...args);
export const toSpeechText = (...args) => state.toSpeechText(...args);
