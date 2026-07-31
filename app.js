/* PWA stuff */
let installPrompt = null;
const installButton = document.querySelector("#install");

if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone) {
    installButton.classList.remove("hidden");
    installButton.onclick = () => alert("To install Xikipedia on iOS, open this site in Safari, tap Share, then Add to Home Screen.");
} else if (!window.matchMedia('(display-mode: standalone)').matches && !window.chrome) {
    installButton.classList.remove("hidden");
    installButton.onclick = () => alert("To install Xikipedia, open it in Chrome or check how your browser installs PWAs.");
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.classList.remove("hidden");
});
installButton.addEventListener("click", async () => {
  if (!installPrompt) {
    return installButton.classList.add("hidden");
  }
  // make sure index is always cached
  await (await fetch("/")).text();
  const result = await installPrompt.prompt();
  console.log(`Install prompt was: ${result.outcome}`);
  disableInAppInstallPrompt();
});

function disableInAppInstallPrompt() {
  installPrompt = null;
  installButton.classList.add("hidden");
}

window.swReg = null;
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then(reg => window.swReg = reg).catch(err => {
        window.swReg = "err";
        console.error(`Registration failed with ${err}`);
    });
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data.event=="downloadProgress")
            updateProgress(event.data.data);
    })
} else {
    window.swReg = "err";
}

const pagesArr = [];
let noPageMaps = {};
const recursiveCache = new Map();
let categoryScores = {
    "given names": -1000,
    "surnames": -1000,
};
let seenPosts = [];
let likedPosts = [];
let dislikedPosts = [];
let likesLen = 0;
let timeSpentSession = 0;
let timeSpentTotal = 0;
let profileName = "Default";

let lastSpentTime = Date.now();

const defaultCategories = ["nature", "science", "animals", "anthropology", "places", "sociology", "art", "mathematics", "games", "technology", "music", "human sexuality"];
let postsWithoutLike = 0;

const HTML_VERSION = "1.5.7";
const CAP_ROLE_COLORS = {
    noun: "#FFE566",
    verb: "#FF6B9D",
    adjective: "#5CFFB1",
    adverb: "#7AD7FF",
    preposition: "#FFB86C",
    article: "#D4A5FF",
    pronoun: "#C4B5FD",
    conjunction: "#F9A8D4",
    number: "#FDE68A",
    date: "#FDBA74",
    link: "#38BDF8",
    other: "#E2E8F0",
};
const CAP_ROLE_LABELS = {
    noun: "Nouns",
    verb: "Verbs",
    adjective: "Adjectives",
    adverb: "Adverbs",
    preposition: "Prepositions",
    article: "Articles",
    pronoun: "Pronouns",
    conjunction: "Conjunctions",
    number: "Numbers",
    date: "Dates",
    link: "Linked pages",
    other: "Other",
};
const PREFETCH_AHEAD = 3;
const RELATED_LINK_CAP = 8;
const DOUBLE_TAP_MS = 260;
const IMAGE_SLIDE_MS = 3500;
// Wiki chrome / template icons — not article content (flags, crests, coats of arms stay in).
const JUNK_IMAGE_RE = /(?:^File:)?(?:Commons-logo|Wiktionary-logo|Wikiquote-logo|Wikibooks-logo|Wikisource-logo|Wikinews-logo|Wikiversity-logo|Wikivoyage-logo|Wikidata-logo|Mediawiki[_-]?logo|Wikipedia[_-]logo|Meta-wiki|Incubator-logo|Wikispecies|Edit-clear|Red[_ ]pencil|Question[_ ]book|Ambox|OOjs[_ ]UI|Icon[_-]|Crystal[_ ]Clear|Nuvola[_ ]|Padlock|Lock-green|Semi-protection|Full-protection|Disambig|Wiki[_ ]letter|Speaker[_ ]Icon|Increase2|Decrease2|Steady2|Text[_ ]document|Folder[_ ]Hexagonal|Symbol[_ ]support[_ ]vote|Yes[_ ]check|X[_ ]mark|Red[_ ]x|Green[_ ]check|Blue[_ ]check|Portal-|Translation[_ ]arrow|Audio-|Loudspeaker|Play[_ ]button|Gnome-|Tango[_ ]|Emblem[_ ]-|Symbol[_ ]neutral|Symbol[_ ]oppose|Symbol[_ ]keep|P_vip|Cscr-featured|Featured[_ ]article|Good[_ ]article|Solid[_ ]blue|Solid[_ ]red|Solid[_ ]green|Information[_ ]icon|Commons[_ ]to[_ ]Wikimedia|Openstreetmap[_ ]logo|Locator[_ ]Dot)/i;
const articleImageCache = new Map();

function loadSettings() {
    const baseSettings = {
        storeData: true,
        openMainWiki: true,
        dataSize: 228005406,
        profile: "default",
        profiles: ["default"],
        theme: "theme-auto",
        muted: false,
        voiceURI: "",
        speechRate: 1,
    };
    const loadedSettings = JSON.parse(localStorage.getItem("xikipedia-settings") ?? '{}');
    const computedSettings = Object.assign(baseSettings, loadedSettings);
    document.querySelector(`#${computedSettings.theme}`).checked = true;
    document.getElementById("setting-storeData").checked = computedSettings.storeData;
    document.getElementById("setting-openMainWiki").checked = computedSettings.openMainWiki;
    const rateEl = document.getElementById("setting-speechRate");
    if (rateEl) {
        rateEl.value = computedSettings.speechRate;
        document.getElementById("speechRateLabel").textContent = `${Number(computedSettings.speechRate).toFixed(1)}x`;
    }
    return computedSettings;
}

function saveSettings() {
    settings.theme = document.querySelector('[name=theme]:checked')?.id ?? "theme-auto";
    settings.storeData = document.getElementById("setting-storeData").checked;
    settings.openMainWiki = document.getElementById("setting-openMainWiki").checked;
    const voiceEl = document.getElementById("setting-voice");
    // Browsers load voices asynchronously; an unpopulated picker has no opinion yet,
    // so reading it here would wipe the stored preference on startup.
    if (voiceEl && voiceEl.dataset.ready) settings.voiceURI = voiceEl.value || "";
    const rateEl = document.getElementById("setting-speechRate");
    if (rateEl) {
        settings.speechRate = Number(rateEl.value) || 1;
        document.getElementById("speechRateLabel").textContent = `${settings.speechRate.toFixed(1)}x`;
    }
    localStorage.setItem("xikipedia-settings", JSON.stringify(settings));
}

function resetAlgorithm() {
    if (!confirm(`Reset recommendations and stats for profile "${profileName}"?`))
        return;
    localStorage.removeItem(`xikipedia-profile-${settings.profile}`);
    loadProfile(settings.profile);
    document.location.reload();
}

async function resetEverything(autoConfirm) {
    if (!autoConfirm && !confirm("Are you sure you want to reset all data and settings?"))
        return;
    if (!autoConfirm && window.swReg && window.swReg !== "err") {
        await (await fetch("/clearHtml")).text();
        return window.swReg.unregister().then(e=>resetEverything(true)).catch(e=>resetEverything(true));
    }
    settings.profiles.forEach(e=>deleteProfile(e));
    localStorage.removeItem("xikipedia-settings");
    document.location.reload();
}

const settings = loadSettings();

// Prefer the version-pinned size; keep localStorage in sync so progress math stays correct
const EXPECTED_DATA_SIZE = 228005406;
if (settings.dataSize !== EXPECTED_DATA_SIZE) {
    settings.dataSize = EXPECTED_DATA_SIZE;
    try { localStorage.setItem("xikipedia-settings", JSON.stringify(settings)); } catch {}
}
const DATA_SIZE = settings.dataSize;
const DATA_URL = `smoldata.json?${DATA_SIZE}`;

function formatDataProgress(loaded, total) {
    const expected = total > 0 ? total : DATA_SIZE;
    const pct = Math.min(100, Math.floor(loaded / expected * 100));
    const mb = Math.max(1, Math.round(expected / (1024 * 1024)));
    return `${pct}% of ${mb}MB loaded`;
}

function getSelectedVoice() {
    if (!window.speechSynthesis || !settings.voiceURI) return null;
    return speechSynthesis.getVoices().find(v => v.voiceURI === settings.voiceURI) || null;
}

function applyVoiceSettings(utter, { rateMultiplier = 1 } = {}) {
    const voice = getSelectedVoice();
    if (voice) utter.voice = voice;
    const base = Number(settings.speechRate) || 1;
    utter.rate = Math.min(2, Math.max(0.5, base * rateMultiplier));
    utter.volume = 1;
}

function populateVoiceOptions() {
    const select = document.getElementById("setting-voice");
    if (!select || !window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices()
        .slice()
        .sort((a, b) => {
            const aEn = a.lang.toLowerCase().startsWith("en") ? 0 : 1;
            const bEn = b.lang.toLowerCase().startsWith("en") ? 0 : 1;
            if (aEn !== bEn) return aEn - bEn;
            return (a.name || "").localeCompare(b.name || "");
        });
    const previous = settings.voiceURI || select.value || "";
    select.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "Default system voice";
    select.appendChild(defaultOpt);
    voices.forEach(voice => {
        const opt = document.createElement("option");
        opt.value = voice.voiceURI;
        opt.textContent = `${voice.name} (${voice.lang})${voice.default ? " — default" : ""}`;
        select.appendChild(opt);
    });
    if (voices.length) select.dataset.ready = "1";
    else delete select.dataset.ready;
    // Keep settings.voiceURI even when the voice is missing — it may still be loading,
    // or belong to another device sharing this profile.
    select.value = [...select.options].some(o => o.value === previous) ? previous : "";
}

function previewSelectedVoice() {
    if (!window.speechSynthesis) return;
    speechUnlocked = true;
    delete tapToPlay?.dataset?.show;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance("Hello from Xikipedia. This is how this narrator sounds on a Wikipedia short.");
    applyVoiceSettings(utter);
    speechSynthesis.speak(utter);
}

function onVoiceSettingsChanged() {
    saveSettings();
    if (activePostEl && activePostData && !settings.muted && !document.hidden)
        speakPost(activePostEl, activePostData, { restart: true });
}

const startBtn = document.getElementById("startBtn");
const categoryPickList = document.getElementById("categoryPickList");
const categorySearch = document.getElementById("categorySearch");
const categorySearchInput = categorySearch.querySelector("input");
const categorySearchSelect = categorySearch.querySelector("select");
const bottomNav = document.querySelector(".bottomNav");

const profilesModal = document.getElementById("profilesModal");
const statsModal = document.getElementById("statsModal");
const settingsModal = document.getElementById("settingsModal");
const aboutModal = document.getElementById("aboutModal");

const profilesList = document.getElementById("profilesList");
const storeDataWarning = document.getElementById("storeDataWarning");

settingsModal.querySelectorAll("input").forEach(e => e.onchange = saveSettings);
const voiceSelect = document.getElementById("setting-voice");
const speechRateInput = document.getElementById("setting-speechRate");
const previewVoiceBtn = document.getElementById("previewVoiceBtn");
if (voiceSelect) voiceSelect.onchange = onVoiceSettingsChanged;
if (speechRateInput) speechRateInput.oninput = onVoiceSettingsChanged;
if (previewVoiceBtn) previewVoiceBtn.onclick = (e) => {
    e.preventDefault();
    previewSelectedVoice();
};

function populateCaptionColorKey() {
    const el = document.getElementById("captionColorKey");
    if (!el || el.childElementCount) return;
    Object.keys(CAP_ROLE_LABELS).forEach(role => {
        const li = document.createElement("li");
        li.className = "colorKeyItem";
        const swatch = document.createElement("span");
        swatch.className = "colorKeySwatch";
        swatch.style.setProperty("--cap-color", CAP_ROLE_COLORS[role]);
        swatch.textContent = "Aa";
        const label = document.createElement("span");
        label.textContent = CAP_ROLE_LABELS[role];
        li.appendChild(swatch);
        li.appendChild(label);
        el.appendChild(li);
    });
}
populateCaptionColorKey();
if (window.speechSynthesis) {
    populateVoiceOptions();
    speechSynthesis.addEventListener("voiceschanged", populateVoiceOptions);
}

categorySearchInput.oninput = () => {
    const searchText = categorySearchInput.value;
    if (!searchText.length)
        return categorySearchSelect.innerText = "";
    const searchTarget = [...pagesArr.map(e=>e.title.toLowerCase()), ...Object.values(noPageMaps).map(e=>e.toLowerCase())];
    let results = searchTarget.filter(e => e.startsWith(searchText.toLowerCase())).slice(0,100);
    if (results.length < 100)
        results = [...results, ...searchTarget.filter(e => e.includes(searchText.toLowerCase()) && !results.includes(e)).slice(0,100-results.length)];
    if (results.length == 100)
        results.push("...");
    categorySearchSelect.innerText = "";
    results.forEach(e => {
        const option = document.createElement("option");
        option.innerText = `${e.slice(0,1).toUpperCase()}${e.slice(1).toLowerCase()}`;
        option.value = e;
        categorySearchSelect.appendChild(option);
    });
}

categorySearchSelect.oninput = () => {
    if (!categorySearchSelect.value || categorySearchSelect.value == "...")
        return;
    addPickableCategory(categorySearchSelect.value, true);
}

function initProfile() {
    if (!settings.storeData)
        return false;
    if (!settings.profiles.length)
        settings.profiles.push("default");
    if (!settings.profiles.includes(settings.profile))
        settings.profile = settings.profiles[0];
    return loadProfile(settings.profile);
}

function loadProfile(profileId) {
    settings.profile = profileId;
    const defaultProfile = {
        profileName: "Default",
        categoryScores: {
            "given names": -1000,
            "surnames": -1000,
        },
        seenPosts: [],
        likedPosts: [],
        dislikedPosts: [],
        timeSpentTotal: 0,
    }
    const loadedProfile = JSON.parse(localStorage.getItem(`xikipedia-profile-${profileId}`) ?? "{}");
    const profile = Object.assign(defaultProfile, loadedProfile);
    categoryScores = profile.categoryScores;
    seenPosts = profile.seenPosts;
    likedPosts = profile.likedPosts;
    dislikedPosts = profile.dislikedPosts || [];
    timeSpentTotal = profile.timeSpentTotal;
    profileName = profile.profileName;
    pagesArr.filter(e=>e.seen).forEach(e=>e.seen=0);
    try {
        seenPosts.forEach(postId => {
            const post = pagesArr.find(e=>e.id==postId);
            post.seen = post.seen || 0;
            post.seen += 1;
        });
    } catch {}
    stopPlayback();
    if (activePostEl) stopImageSlideshow(activePostEl);
    activePostEl = null;
    activePostData = null;
    if (feedObserver) {
        feedObserver.disconnect();
        feedObserver = null;
    }
    const postsEl = document.querySelector(".posts");
    postsEl.querySelectorAll(".post").forEach(stopImageSlideshow);
    postsEl.innerHTML = "";
    postsEl.scrollTop = 0;
    likesLen = likedPosts.length;
    saveSettings();
    saveProfile();
    return !!seenPosts.length;
}

function restartFeed() {
    const postsEl = postsRoot();
    if (!postsEl || !pagesArr.length) return;
    ensurePrefetch();
    const first = postsEl.querySelector(".post");
    if (first) {
        first.scrollIntoView({ block: "start" });
        setActivePost(first, true);
    }
}

function saveProfile() {
    if (!settings.storeData)
        return;
    const profile = {
        profileName,
        categoryScores,
        seenPosts,
        likedPosts,
        dislikedPosts,
        timeSpentTotal,
    }
    localStorage.setItem(`xikipedia-profile-${settings.profile}`, JSON.stringify(profile));
}

function addProfile(newProfileName) {
    const profileId = Math.random().toString(36).slice(2);
    localStorage.setItem(`xikipedia-profile-${profileId}`, JSON.stringify({profileName:newProfileName}));
    settings.profiles.push(profileId);
    loadProfile(profileId);
    document.location.reload();
}

function deleteProfile(profileId, skipInit) {
    localStorage.removeItem(`xikipedia-profile-${profileId}`);
    settings.profiles = settings.profiles.filter(e => e != profileId);
    if (profileId != settings.profile || skipInit)
        return;
    initProfile();
}

function showProfilesModal() {
    profilesModal.showModal();
    storeDataWarning.style.display = settings.storeData ? "none" : "block";
    profilesList.innerText = "";
    settings.profiles.forEach(profileId => {
        const profileName = JSON.parse(localStorage.getItem(`xikipedia-profile-${profileId}`) ?? "{}")?.profileName || profileId;
        const isCurrentProfile = profileId == settings.profile;
        const profileEntry = document.createElement("profile-entry");
        const deleteButton = document.createElement("button");
        profileEntry.innerText = profileName;
        if (isCurrentProfile)
            profileEntry.classList.add("current");
        profileEntry.setAttribute("tabindex", "0");
        profileEntry.setAttribute("role", "button");
        const loadThisProfile = e => {
            settings.profile = profileId;
            loadProfile(profileId);
            restartFeed();
            profilesModal.close();
            showProfilesModal();
        };
        profileEntry.onclick = loadThisProfile;
        profileEntry.onkeydown = e => (e.keyCode == 13 || e.keyCode == 32) ? loadThisProfile(e) : true;
        deleteButton.innerText = "Delete";
        const deleteThisProfile = e => {
            e.stopPropagation();
            if (confirm(`Delete profile ${profileName}?`)) {
                deleteProfile(profileId);
                // profileEntry.remove();
                profilesModal.close();
                showProfilesModal();
            }
        };
        deleteButton.onclick = deleteThisProfile;
        deleteButton.onkeydown = e => (e.keyCode == 13 || e.keyCode == 32) ? deleteThisProfile(e) : true;
        profileEntry.appendChild(deleteButton);
        profilesList.appendChild(profileEntry);
    });
    const addProfileButton = document.createElement("button");
    addProfileButton.innerText = "Add profile";
    addProfileButton.onclick = () => {
        const profileName = prompt("Profile name");
        if (profileName && profileName.length) {
            addProfile(profileName);
            profilesModal.close();
            showProfilesModal();
        }
    }
    profilesList.appendChild(addProfileButton);
}

function textTime(ms) {
    const h = Math.floor(ms/1000/3600);
    const m = Math.floor((ms/1000/60) % 60);
    const s = Math.floor((ms/1000) % 60);
    let timeText = `${s} second${s==1?'':'s'}`;
    if (m || h) {
        timeText = `${m} minute${m==1?'':'s'}`;
    }
    if (h) {
        timeText = `${h} hour${h==1?'':'s'}, ${m} minute${m==1?'':'s'}`;
    }
    return timeText;
}

let topStatsStale = false;
let likeStatsStale = false;

function updateTopStats() {
    if (!topStatsStale)
        return;
    topStatsStale = false;
    const sorted = Object.entries(categoryScores).filter(e => e[1]).sort((a, b) => b[1] - a[1]);
    const top100 = sorted.slice(0, 100);
    const bottom100 = sorted.slice(sorted.length-100).reverse();
    document.getElementById("top100").innerText = top100.map(([k,v]) => `${convertCat(k)}: ${v}`).join("\n");
    document.getElementById("bottom100").innerText = bottom100.map(([k,v]) => `${convertCat(k)}: ${v}`).join("\n");
}

function updateLikeStats() {
    if (!likeStatsStale)
        return;
    likeStatsStale = false;
    const fillList = (elId, ids) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.innerText = "";
        ids.forEach(postId => {
            const post = pagesArr.find(e=>e.id==postId);
            const link = document.createElement(post ? "a" : "em");
            link.classList.add("likedPostEntry");
            if (post) {
                link.innerText = post.title;
                link.href = getArticleLink(post.title);
            } else {
                link.innerText = `Unknown post (id: ${postId})`;
            }
            el.appendChild(link);
        });
    };
    fillList("likedPosts", likedPosts);
    fillList("dislikedPosts", dislikedPosts);
}

function showStatsModal() {
    statsModal.showModal();
    topStatsStale = true;
    likeStatsStale = true;
    document.getElementById("generalStats").innerText = `Shorts watched (total): ${seenPosts.length}\nShorts watched (session): ${seenPosts.length - likesLen}\nTime watching (total): ${textTime(timeSpentTotal)}\nTime watching (session): ${textTime(timeSpentSession)}`;
    document.querySelectorAll("#statsModal details").forEach(e => e.open = false);
}

// High-level buckets for the Following page — more specific groups first.
const TOPIC_GROUPS = [
    {
        id: "entertainment",
        label: "Film & TV",
        emoji: "🎬",
        wikiPage: "Film",
        accent: "#FF6B9D",
        patterns: [
            /\b(science fiction|sci-?fi|film|movie|cinema|television|tv show|tv series|actor|actress|screenwriter|director|producer|hollywood|sitcom|soap opera|anime|cartoon)\b/,
        ],
    },
    {
        id: "music",
        label: "Music",
        emoji: "🎵",
        wikiPage: "Music",
        accent: "#D4A5FF",
        patterns: [
            /\b(music|song|singer|songwriter|album|band|musician|composer|orchestra|jazz|rock|hip hop|rap|opera|grammy)\b/,
        ],
    },
    {
        id: "sports",
        label: "Sports & Games",
        emoji: "🏆",
        wikiPage: "Sport",
        accent: "#FFE566",
        patterns: [
            /\b(sport|olympic|football|soccer|baseball|basketball|tennis|cricket|hockey|golf|racing|athlete|championship|video game|board game|card game|chess)\b/,
        ],
    },
    {
        id: "science",
        label: "Science",
        emoji: "🔬",
        wikiPage: "Science",
        accent: "#7AD7FF",
        patterns: [
            /\b(science|physics|chemistry|biology|geology|astronomy|scientist|research|experiment|molecule|atom|element|evolution|genetics)\b/,
        ],
    },
    {
        id: "space",
        label: "Space",
        emoji: "🪐",
        wikiPage: "Outer space",
        accent: "#A5B4FC",
        patterns: [/\b(space|planet|galaxy|astronom|astronaut|nasa|solar system|constellation|nebula|cosmos)\b/],
    },
    {
        id: "tech",
        label: "Technology",
        emoji: "💻",
        wikiPage: "Technology",
        accent: "#5CFFB1",
        patterns: [
            /\b(technology|computer|software|internet|engineering|robot|electronics|programming|invention|telecommunication|ai\b|artificial intelligence)\b/,
        ],
    },
    {
        id: "math",
        label: "Mathematics",
        emoji: "➗",
        wikiPage: "Mathematics",
        accent: "#FDBA74",
        patterns: [/\b(math|mathematics|geometry|algebra|number theory|statistics|calculus)\b/],
    },
    {
        id: "nature",
        label: "Nature & Animals",
        emoji: "🌿",
        wikiPage: "Nature",
        accent: "#86EFAC",
        patterns: [
            /\b(nature|animal|bird|fish|mammal|reptile|insect|wildlife|plant|tree|flower|forest|ocean|environment|ecology|dinosaur|species)\b/,
        ],
    },
    {
        id: "places",
        label: "Places",
        emoji: "🌍",
        wikiPage: "Geography",
        accent: "#38BDF8",
        patterns: [
            /\b(country|countries|city|cities|capital|geography|state|island|continent|region|province|municipality|settlement|landform|mountain|river|lake|sea|ocean|desert)\b/,
        ],
    },
    {
        id: "history",
        label: "History",
        emoji: "🏛️",
        wikiPage: "History",
        accent: "#FCD34D",
        patterns: [
            /\b(history|historical|ancient|century|empire|civilization|war|battle|revolution|medieval|prehistoric|archaeology)\b/,
        ],
    },
    {
        id: "arts",
        label: "Arts & Design",
        emoji: "🎨",
        wikiPage: "Art",
        accent: "#F9A8D4",
        patterns: [
            /\b(art|painting|painter|sculpture|artist|design|architecture|architect|photography|fashion|museum|gallery)\b/,
        ],
    },
    {
        id: "books",
        label: "Books & Language",
        emoji: "📚",
        wikiPage: "Literature",
        accent: "#C4B5FD",
        patterns: [
            /\b(book|literature|writer|author|novel|poem|poetry|language|linguistics|dictionary|encyclopedia|mythology|folklore)\b/,
        ],
    },
    {
        id: "food",
        label: "Food & Drink",
        emoji: "🍽️",
        wikiPage: "Food",
        accent: "#FDBA74",
        patterns: [/\b(food|drink|cooking|cuisine|recipe|dish|beverage|restaurant|fruit|vegetable|meat)\b/],
    },
    {
        id: "health",
        label: "Health & Body",
        emoji: "🩺",
        wikiPage: "Medicine",
        accent: "#FDA4AF",
        patterns: [
            /\b(medicine|medical|health|disease|hospital|anatomy|physiology|doctor|nurse|therapy|psychology|mental health)\b/,
        ],
    },
    {
        id: "society",
        label: "Society & Politics",
        emoji: "⚖️",
        wikiPage: "Society",
        accent: "#93C5FD",
        patterns: [
            /\b(politic|government|law|legal|leader|president|prime minister|parliament|election|diplomacy|human rights|sociology|anthropology|culture|society|religion|christian|islam|muslim|judaism|jewish|hindu|buddhist|church|faith|philosophy|ethic)\b/,
        ],
    },
    {
        id: "people",
        label: "People",
        emoji: "👥",
        wikiPage: "Human",
        accent: "#F0ABFC",
        patterns: [
            /\b(people|person|biography|musician|politician|scientist|athlete|royalty|monarch|family|women|men|children)\b/,
        ],
    },
    {
        id: "other",
        label: "More interests",
        emoji: "✨",
        wikiPage: "Knowledge",
        accent: "#2cafff",
        patterns: [],
    },
];

const TOPIC_NOISE_RE = [
    /^living people$/,
    /^basic english/,
    /^given names$/,
    /^surnames$/,
    /^deaths from /,
    /^year of (birth|death)/,
    /^\d{1,4} (births|deaths)$/,
    /^people from /,
    /^alumni of /,
    /^members of the /,
    /^recipients of /,
    /^winners of /,
    /^award[- ]winning /,
    /^naturalized citizens/,
    /^english-speaking countries$/,
    /^french-speaking countries$/,
    /^spanish-speaking countries$/,
    /^commonwealth member states$/,
    /^european union member states$/,
    /^least developed countries$/,
    /^current monarchies$/,
    /^time people of the year$/,
    /^all-stub articles$/,
    /^articles needing/,
    /^wikipedia /,
    /^redirects /,
];

function isNoiseTopic(category) {
    const name = String(category || "").toLowerCase().trim();
    if (!name || name.startsWith("p:")) return true;
    return TOPIC_NOISE_RE.some(re => re.test(name));
}

function formatTopicLabel(category) {
    const raw = convertCat(category);
    return String(raw)
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, ch => ch.toUpperCase());
}

function classifyTopicGroup(category) {
    const name = String(category || "").toLowerCase();
    for (const group of TOPIC_GROUPS) {
        if (group.id === "other") continue;
        if (group.id === "science" && /\bfiction\b/.test(name)) continue;
        if (group.patterns.some(re => re.test(name)))
            return group;
    }
    return TOPIC_GROUPS[TOPIC_GROUPS.length - 1];
}

function classifyPostTopic(post) {
    const scores = new Map();
    const addMatch = (text, weight) => {
        const name = String(text || "").toLowerCase();
        TOPIC_GROUPS.forEach(group => {
            if (group.id === "other") return;
            if (group.id === "science" && /\bfiction\b/.test(name)) return;
            if (group.patterns.some(re => re.test(name)))
                scores.set(group.id, (scores.get(group.id) || 0) + weight);
        });
    };
    addMatch(post?.title, 3);
    (post?.categories || []).forEach(category => addMatch(category, 1));
    let best = TOPIC_GROUPS[TOPIC_GROUPS.length - 1];
    let bestScore = 0;
    TOPIC_GROUPS.forEach(group => {
        const score = scores.get(group.id) || 0;
        if (score > bestScore) {
            best = group;
            bestScore = score;
        }
    });
    return best;
}

const articleRepCache = new Map();
const templateMetaCache = new Map();

function groupForSubject(subject) {
    const hit = classifyTopicGroup(subject);
    return hit?.id === "other" ? classifyTopicGroup(`${subject} topic`) : hit;
}

function representationCategoryLabel(rep) {
    if (!rep) return "";
    if (rep.kind === "stub" && rep.subject)
        return String(rep.subject).replace(/\b\w/g, ch => ch.toUpperCase());
    if (rep.kind === "series" && rep.subject)
        return String(rep.subject).trim();
    return rep.group?.label || rep.label || "";
}

function applyAvatarRepresentation(avatar, rep, sourceLine) {
    if (!avatar || !rep) return;
    avatar.style.setProperty("--avatar-accent", rep.accent || "#2cafff");
    avatar.dataset.repKind = rep.kind || "topic";
    avatar.title = rep.label;
    avatar.setAttribute("aria-label", rep.label);
    avatar.replaceChildren();
    if (rep.image) {
        const img = document.createElement("img");
        img.src = commonsThumbUrl(rep.image, 96);
        img.alt = "";
        img.draggable = false;
        img.onerror = () => {
            avatar.textContent = rep.emoji || "✨";
        };
        avatar.appendChild(img);
    } else {
        avatar.textContent = rep.emoji || "✨";
    }
    if (sourceLine) {
        const category = representationCategoryLabel(rep);
        sourceLine.textContent = category;
        sourceLine.hidden = !category;
    }
}

async function fetchTemplateMeta(templateTitle) {
    const key = templateTitle.replace(/^Template:/i, "");
    if (templateMetaCache.has(key)) return templateMetaCache.get(key);
    const promise = (async () => {
        try {
            const url = new URL("https://simple.wikipedia.org/w/api.php");
            url.searchParams.set("action", "parse");
            url.searchParams.set("format", "json");
            url.searchParams.set("origin", "*");
            url.searchParams.set("page", `Template:${key}`);
            url.searchParams.set("prop", "wikitext");
            url.searchParams.set("redirects", "1");
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            return data?.parse?.wikitext?.["*"] || null;
        } catch {
            return null;
        }
    })();
    templateMetaCache.set(key, promise);
    return promise;
}

function parseStubTemplateWikitext(wt) {
    if (!wt) return null;
    const image = wt.match(/\|\s*image\s*=\s*([^\n|}]+)/i)?.[1]?.trim();
    const subject = wt.match(/\|\s*subject\s*=\s*([^\n|}]+)/i)?.[1]?.trim();
    if (!subject && !image) return null;
    const group = groupForSubject(subject || "");
    return {
        kind: "stub",
        subject: subject || group.label.toLowerCase(),
        label: subject ? `Short article about ${subject}` : group.label,
        image: image || null,
        emoji: group.emoji,
        accent: group.accent,
        group,
    };
}

function parseSeriesTemplateWikitext(wt) {
    if (!wt || !/part of a series on/i.test(wt)) return null;
    const titleLine = wt.match(/\|\s*title\s*=\s*([^\n]+)/i)?.[1] || "";
    const subject = titleLine
        .replace(/part of a series on/ig, "")
        .replace(/\[\[([^|\]]+)\|[^\]]*\]\]/g, "$1")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/<[^>]+>/g, "")
        .trim();
    const imageLine = wt.match(/\|\s*image\s*=\s*([^\n]+)/i)?.[1] || "";
    const image = imageLine.match(/\[\[(?:File|Image):([^|\]]+)/i)?.[1]
        || imageLine.match(/(?:File|Image):([^\s|\]}]+)/i)?.[1]
        || null;
    if (!subject && !image) return null;
    const group = groupForSubject(subject || "religion");
    return {
        kind: "series",
        subject: subject || group.label,
        label: subject ? `Part of a series on ${subject}` : "Part of a series",
        image: image ? image.trim() : null,
        emoji: group.emoji,
        accent: group.accent,
        group,
    };
}

async function resolveStubRepresentation(templateTitles, categoryTitles) {
    const stubTemplate = (templateTitles || []).find(t =>
        /stub$/i.test(t.replace(/^Template:/i, "")) &&
        !/stub-template|uncategorized|multistub|^stub$/i.test(t.replace(/^Template:/i, ""))
    );
    if (stubTemplate) {
        const wt = await fetchTemplateMeta(stubTemplate);
        const parsed = parseStubTemplateWikitext(wt);
        if (parsed) return parsed;
        const subject = stubTemplate.replace(/^Template:/i, "").replace(/-stub$/i, "").replace(/-/g, " ");
        const group = groupForSubject(subject);
        return {
            kind: "stub",
            subject,
            label: `Short article about ${subject}`,
            image: null,
            emoji: group.emoji,
            accent: group.accent,
            group,
        };
    }
    const stubCat = (categoryTitles || []).find(c => / stubs$/i.test(c.replace(/^Category:/i, "")));
    if (stubCat) {
        const subject = stubCat.replace(/^Category:/i, "").replace(/ stubs$/i, "").trim();
        const group = groupForSubject(subject);
        return {
            kind: "stub",
            subject: subject.toLowerCase(),
            label: `Short article about ${subject.toLowerCase()}`,
            image: null,
            emoji: group.emoji,
            accent: group.accent,
            group,
        };
    }
    return null;
}

async function resolveSeriesRepresentation(templateTitles) {
    const candidates = (templateTitles || []).filter(t => {
        const name = t.replace(/^Template:/i, "");
        return /(footer|sidebar|series|navbox)/i.test(name) && !/^navbox$/i.test(name);
    });
    // Prefer explicit topical footers over generic navboxes.
    candidates.sort((a, b) => {
        const score = (t) => /footer|sidebar|series/i.test(t) ? 0 : 1;
        return score(a) - score(b);
    });
    for (const template of candidates.slice(0, 6)) {
        const wt = await fetchTemplateMeta(template);
        const parsed = parseSeriesTemplateWikitext(wt);
        if (parsed) return parsed;
    }
    return null;
}

async function fetchArticleRepresentation(post) {
    const cacheKey = post?.title || String(post?.id || "");
    if (!cacheKey) return null;
    if (articleRepCache.has(cacheKey)) return articleRepCache.get(cacheKey);
    const promise = (async () => {
        try {
            const url = new URL("https://simple.wikipedia.org/w/api.php");
            url.searchParams.set("action", "query");
            url.searchParams.set("format", "json");
            url.searchParams.set("origin", "*");
            url.searchParams.set("redirects", "1");
            url.searchParams.set("prop", "categories|templates");
            url.searchParams.set("cllimit", "50");
            url.searchParams.set("tllimit", "100");
            url.searchParams.set("tlnamespace", "10");
            url.searchParams.set("titles", post.title);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`rep ${res.status}`);
            const data = await res.json();
            const page = Object.values(data?.query?.pages || {})[0] || {};
            const categories = (page.categories || []).map(c => c.title);
            const templates = (page.templates || [])
                .map(t => t.title)
                .filter(t => /^Template:/i.test(t));
            const stub = await resolveStubRepresentation(templates, categories);
            if (stub) return stub;
            const series = await resolveSeriesRepresentation(templates);
            if (series) return series;
            return null;
        } catch {
            return null;
        }
    })();
    articleRepCache.set(cacheKey, promise);
    return promise;
}

async function hydrateArticleAvatar(avatar, post, sourceLine) {
    if (!avatar || !post) return;
    const fallback = classifyPostTopic(post);
    applyAvatarRepresentation(avatar, {
        kind: "topic",
        label: fallback.label,
        emoji: fallback.emoji,
        accent: fallback.accent,
        image: null,
        group: fallback,
    }, sourceLine);
    const rep = await fetchArticleRepresentation(post);
    if (rep) applyAvatarRepresentation(avatar, rep, sourceLine);
}

function getFollowedTopics(limit = 48) {
    return Object.entries(categoryScores)
        .filter(([category, score]) =>
            !isNoiseTopic(category) &&
            Number.isFinite(Number(score)) &&
            Number(score) > 0
        )
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, limit)
        .map(([category, score]) => {
            const group = classifyTopicGroup(category);
            return {
                category,
                score: Number(score),
                group,
                label: formatTopicLabel(category),
            };
        });
}

// Topic art is loaded only for Following headers. It is intentionally kept
// separate from articleImageCache and never appended to a short's .visual.
const topicIconCache = new Map();

function fetchTopicIcon(group) {
    if (!group?.wikiPage) return Promise.resolve(null);
    if (topicIconCache.has(group.id)) return topicIconCache.get(group.id);
    const promise = (async () => {
        try {
            const url = new URL("https://simple.wikipedia.org/w/api.php");
            url.searchParams.set("action", "query");
            url.searchParams.set("format", "json");
            url.searchParams.set("origin", "*");
            url.searchParams.set("redirects", "1");
            url.searchParams.set("prop", "pageimages");
            url.searchParams.set("pithumbsize", "128");
            url.searchParams.set("titles", group.wikiPage);
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            const page = Object.values(data?.query?.pages || {})[0];
            return page?.thumbnail?.source || null;
        } catch {
            return null;
        }
    })();
    topicIconCache.set(group.id, promise);
    return promise;
}

function makeTopicIcon(group) {
    const icon = document.createElement("span");
    icon.className = "followingSectionIcon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = group.emoji;
    fetchTopicIcon(group).then(src => {
        if (!src) return;
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.onload = () => icon.replaceChildren(img);
    });
    return icon;
}

function renderFollowingPage() {
    const feed = document.getElementById("followingGrid");
    const empty = document.getElementById("followingEmpty");
    if (!feed || !empty) return;
    feed.innerHTML = "";
    const topics = getFollowedTopics();
    empty.hidden = topics.length > 0;
    if (!topics.length) return;

    const maxScore = Math.max(...topics.map(t => t.score), 1);
    const byGroup = new Map();
    topics.forEach(topic => {
        const list = byGroup.get(topic.group.id) || [];
        list.push(topic);
        byGroup.set(topic.group.id, list);
    });

    const sections = TOPIC_GROUPS
        .map(group => {
            const items = byGroup.get(group.id) || [];
            if (!items.length) return null;
            const total = items.reduce((sum, t) => sum + t.score, 0);
            return { group, items, total };
        })
        .filter(Boolean)
        .sort((a, b) => b.total - a.total);

    sections.forEach(section => {
        const sectionEl = document.createElement("section");
        sectionEl.className = "followingSection";
        sectionEl.style.setProperty("--topic-accent", section.group.accent);

        const head = document.createElement("div");
        head.className = "followingSectionHead";
        const title = document.createElement("h2");
        title.append(makeTopicIcon(section.group), section.group.label);
        const meta = document.createElement("span");
        meta.className = "followingSectionMeta";
        meta.textContent = `${section.items.length} topic${section.items.length === 1 ? "" : "s"}`;
        head.append(title, meta);

        const grid = document.createElement("div");
        grid.className = "followingGrid";
        section.items.slice(0, 8).forEach((topic, index) => {
            const card = document.createElement("article");
            card.className = "followingCard";
            const strength = Math.max(8, Math.round((topic.score / maxScore) * 100));
            card.style.setProperty("--topic-strength", `${strength}%`);
            card.style.setProperty("--topic-accent", section.group.accent);

            const rank = document.createElement("span");
            rank.className = "followingRank";
            rank.textContent = String(index + 1);
            const name = document.createElement("h3");
            name.textContent = topic.label;
            const meter = document.createElement("div");
            meter.className = "followingMeter";
            meter.setAttribute("aria-label", `${strength}% relative interest`);

            card.append(rank, name, meter);
            grid.appendChild(card);
        });

        sectionEl.append(head, grid);
        feed.appendChild(sectionEl);
    });
}

function followingPageIsOpen() {
    return !document.getElementById("followingPage")?.hidden;
}

function showFollowingPage() {
    const page = document.getElementById("followingPage");
    const feed = postsRoot();
    if (!page || !feed) return;
    pausePlayback();
    renderFollowingPage();
    page.hidden = false;
    page.inert = false;
    feed.inert = true;
    feed.setAttribute("aria-hidden", "true");
    document.querySelector(".followingTab")?.classList.add("active");
    document.querySelector(".followingTab")?.setAttribute("aria-current", "page");
    document.querySelector(".forYouTab")?.classList.remove("active");
    document.querySelector(".forYouTab")?.removeAttribute("aria-current");
}

function showForYouPage() {
    const page = document.getElementById("followingPage");
    const feed = postsRoot();
    if (!page || !feed) return;
    const wasOpen = !page.hidden;
    page.hidden = true;
    page.inert = true;
    page.scrollTop = 0;
    feed.inert = false;
    feed.removeAttribute("aria-hidden");
    document.querySelector(".followingTab")?.classList.remove("active");
    document.querySelector(".followingTab")?.removeAttribute("aria-current");
    document.querySelector(".forYouTab")?.classList.add("active");
    document.querySelector(".forYouTab")?.setAttribute("aria-current", "page");
    if (wasOpen && activePostEl && !document.hidden && !document.querySelector("dialog[open]"))
        resumePlayback();
}

document.querySelector(".followingTab")?.addEventListener("click", showFollowingPage);
document.querySelector(".forYouTab")?.addEventListener("click", showForYouPage);

function showSettingsModal() {
    populateVoiceOptions();
    settingsModal.showModal();
}

function showAboutModal() {
    aboutModal.showModal();
}

//const MAX_DEPTH = 10;
function recursiveCategories(subCategories, categories, depth) {
    const allCategories = new Set(categories);
    categories.forEach(e => {
        const cat = e?.toLowerCase?.();
        if (!cat) return [];
        const subs = (subCategories[cat] ?? []);
        if (!subs.length)
            return;
        let cacheValue = recursiveCache.get(cat);
        if (!cacheValue) {
            recursiveCache.set(cat, -1);
            cacheValue = recursiveCategories(subCategories, subs, depth + 1);
            recursiveCache.set(cat, cacheValue);
        } else if (cacheValue == -1) {
            recursiveCache.set(cat, []);
            cacheValue = recursiveCategories(subCategories, subs, depth + 1);
            recursiveCache.set(cat, cacheValue);
        }
        allCategories.add(...subs);
        allCategories.add(...cacheValue);
    });
    return new Set([...allCategories].map(e=>e?.toLowerCase?.()||e));
}

function convertCat(cat) {
    if (cat.startsWith("p:")) {
        cat = cat.slice(2);
        return pagesArr.find(e=>e.id == cat)?.title ?? noPageMaps[cat] ?? cat;
    }
    return cat;
}

function engagePost(post, amount) {
    post.allCategories.forEach(e => categoryScores[e] = (categoryScores[e] ?? 0) + amount);
    return amount;
}

function getArticleLink(articleTitle, forceSimple) {
    const wiki = forceSimple || !settings.openMainWiki ? 'simple' : 'en';
    return `https://${wiki}.wikipedia.org/wiki/${articleTitle.replace(/ /g, '_')}`;
}

async function shareArticle(post, shareBtn) {
    if (!post) return;
    const url = getArticleLink(post.title);
    const title = post.title;
    const text = `${post.title} — Wikipedia`;
    const label = shareBtn?._actionLabel;
    const flash = (msg) => {
        if (!label) return;
        const prev = label.textContent;
        label.textContent = msg;
        setTimeout(() => {
            if (label.textContent === msg) label.textContent = prev;
        }, 1400);
    };
    try {
        if (navigator.share) {
            await navigator.share({ title, text, url });
            flash("Shared");
            return;
        }
    } catch (err) {
        if (err && err.name === "AbortError") return;
    }
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            flash("Copied");
            return;
        }
    } catch {}
    window.prompt("Copy Wikipedia link:", url);
}

function getPageById(pageId) {
    return pagesArr.find(e => e.id == pageId) || null;
}

function resolveLinkTitle(pageId) {
    return getPageById(pageId)?.title ?? noPageMaps[pageId] ?? null;
}

function findRelatedInSummary(post) {
    const text = ` ${post.text} `.toLowerCase();
    const candidates = [];
    for (const linkId of (post.links || [])) {
        const title = resolveLinkTitle(linkId);
        if (!title || title.toLowerCase() === post.title.toLowerCase()) continue;
        const page = getPageById(linkId);
        if (!page) continue;
        const needle = title.toLowerCase();
        if (needle.length < 3) continue;
        if (text.includes(needle))
            candidates.push({ id: linkId, title, page, len: needle.length });
    }
    candidates.sort((a, b) => b.len - a.len);
    const used = new Set();
    const out = [];
    for (const c of candidates) {
        if (used.has(c.id)) continue;
        used.add(c.id);
        out.push(c);
        if (out.length >= RELATED_LINK_CAP) break;
    }
    return out;
}

const postsRoot = () => document.querySelector(".posts");
const descriptionSheet = document.getElementById("descriptionSheet");
const tapToPlay = document.getElementById("tapToPlay");
let activePostEl = null;
let activePostData = null;
let feedObserver = null;
let speechUnlocked = false;
let playbackPaused = false;
let playbackRate = 1;
let currentUtterance = null;
let captionTimer = null;
let captionWords = [];
let captionIndex = 0;
let usingBoundarySync = false;
let holdTimer = null;
let holdingSpeed = false;
let pendingTapTimer = null;
let lastTapAt = 0;
let pointerDownAt = 0;
let pointerStart = null;
let gestureMoved = false;
let descPostEl = null;

function stopCaptionTimer() {
    if (captionTimer) {
        clearTimeout(captionTimer);
        captionTimer = null;
    }
}

// Tokens like "1928-1938" or "Constantinople" take far longer to say than one plain word.
function captionWordWeight(raw) {
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
function tokenIndexAtChar(spans, charIndex) {
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

function stopPlayback() {
    stopCaptionTimer();
    if (window._shortLoopTimer) {
        clearTimeout(window._shortLoopTimer);
        window._shortLoopTimer = null;
    }
    // Cleared first so the cancelled utterance's onend/onerror handlers no-op.
    currentUtterance = null;
    usingBoundarySync = false;
    if (window.speechSynthesis)
        speechSynthesis.cancel();
}

function resetCaptionStyles(words) {
    words.forEach(w => {
        w.classList.remove("active", "spoken");
        w.style.removeProperty("--cap-color");
    });
}

function highlightCaptionWord(index) {
    if (!captionWords.length) return;
    const i = Math.max(0, Math.min(index, captionWords.length - 1));
    captionWords.forEach((w, idx) => {
        w.classList.toggle("spoken", idx < i);
        w.classList.toggle("active", idx === i);
        if (idx === i) {
            const role = w.dataset.capRole || "other";
            w.style.setProperty("--cap-color", CAP_ROLE_COLORS[role] || CAP_ROLE_COLORS.other);
        }
    });
    captionIndex = i;
    if (activePostEl) {
        const progress = activePostEl.querySelector(".playbackProgress");
        if (progress) {
            const value = captionWords.length > 1
                ? (i / (captionWords.length - 1)) * 100
                : 100;
            progress.style.setProperty("--progress", `${value}%`);
            progress.setAttribute("aria-valuenow", String(Math.round(value)));
        }
        syncCaptionLinkedImage(activePostEl, captionWords[i]);
    }
}

function startTimedCaptions(words, rate, fromIndex = 0) {
    stopCaptionTimer();
    if (!words.length) return;
    const msPerWord = Math.max(120, 280 / (rate || 1));
    let i = Math.max(0, Math.min(fromIndex, words.length - 1));
    highlightCaptionWord(i);
    const step = () => {
        i++;
        if (i >= words.length) {
            stopCaptionTimer();
            highlightCaptionWord(words.length - 1);
            // Muted / no-TTS path has no utterance.onend, so loop from here.
            if (settings.muted || !speechUnlocked || !window.speechSynthesis)
                scheduleShortLoop();
            return;
        }
        highlightCaptionWord(i);
        captionTimer = setTimeout(step, msPerWord * captionWordWeight(words[i].textContent));
    };
    captionTimer = setTimeout(step, msPerWord * captionWordWeight(words[i].textContent));
}

function canLoopCurrentShort() {
    return !!(
        activePostEl &&
        activePostData &&
        !playbackPaused &&
        !document.hidden &&
        !followingPageIsOpen() &&
        !document.querySelector("dialog[open]")
    );
}

function scheduleShortLoop(delayMs = 400) {
    if (window._shortLoopTimer) {
        clearTimeout(window._shortLoopTimer);
        window._shortLoopTimer = null;
    }
    window._shortLoopTimer = setTimeout(() => {
        window._shortLoopTimer = null;
        loopCurrentShort();
    }, delayMs);
}

function loopCurrentShort() {
    if (!canLoopCurrentShort()) return;
    const postEl = activePostEl;
    const post = activePostData;
    postEl._showingLink = null;
    postEl._slideIndex = 0;
    const visual = postEl.querySelector(".visual");
    if (visual) showSlideImage(visual, 0);
    speakPost(postEl, post, { restart: true });
    startImageSlideshow(postEl);
}

function setPausedUi(postEl, paused) {
    if (!postEl) return;
    const wasPaused = !!postEl.dataset.paused;
    const icon = postEl.querySelector(".pauseIcon");
    if (paused) {
        postEl.dataset.paused = "1";
        if (icon) {
            delete icon.dataset.flash;
            icon.textContent = "⏸️";
        }
        return;
    }
    delete postEl.dataset.paused;
    if (!icon || !wasPaused) return;
    // Brief play-glyph flash so resuming gets the same feedback as pausing.
    icon.textContent = "▶️";
    delete icon.dataset.flash;
    void icon.offsetWidth;
    icon.dataset.flash = "1";
}

// Speaks from a caption word index so pause/resume and speed changes can restart cleanly.
function speakFrom(postEl, post, startIndex) {
    if (!postEl || !post) return;
    const words = [...postEl.querySelectorAll(".caption-word")];
    captionWords = words;
    const baseIndex = words.length ? Math.max(0, Math.min(startIndex, words.length - 1)) : 0;
    stopPlayback();
    resetCaptionStyles(words);
    highlightCaptionWord(baseIndex);

    if (settings.muted || !window.speechSynthesis) {
        startTimedCaptions(words, playbackRate, baseIndex);
        return;
    }
    if (!speechUnlocked) {
        tapToPlay.dataset.show = "1";
        startTimedCaptions(words, playbackRate, baseIndex);
        return;
    }

    const spoken = words.slice(baseIndex).map(w => w.textContent);
    const text = spoken.join("").trim() || post.text;
    // Character offset where each caption token starts inside `text`.
    const tokenStarts = [];
    let cursor = 0;
    for (const raw of spoken) {
        tokenStarts.push(cursor);
        cursor += raw.length;
    }
    const utter = new SpeechSynthesisUtterance(text);
    applyVoiceSettings(utter, { rateMultiplier: playbackRate === 1 ? 1 : playbackRate });
    currentUtterance = utter;
    usingBoundarySync = false;

    utter.onboundary = (ev) => {
        if (ev.name && ev.name !== "word") return;
        usingBoundarySync = true;
        stopCaptionTimer();
        const offset = tokenStarts.length
            ? tokenIndexAtChar(tokenStarts, ev.charIndex || 0)
            : 0;
        highlightCaptionWord(baseIndex + offset);
    };
    utter.onend = () => {
        if (currentUtterance !== utter) return;
        currentUtterance = null;
        stopCaptionTimer();
        if (words.length)
            highlightCaptionWord(words.length - 1);
        if (activePostEl === postEl)
            scheduleShortLoop();
    };
    utter.onerror = () => {
        if (currentUtterance !== utter) return;
        currentUtterance = null;
        if (!usingBoundarySync)
            startTimedCaptions(words, playbackRate, baseIndex);
    };

    speechSynthesis.speak(utter);
    // Fallback if boundary events never fire
    setTimeout(() => {
        if (currentUtterance === utter && !usingBoundarySync && !playbackPaused && !settings.muted)
            startTimedCaptions(words, playbackRate, baseIndex);
    }, 400);
}

function speakPost(postEl, post, { restart = true } = {}) {
    playbackPaused = false;
    setPausedUi(postEl, false);
    speakFrom(postEl, post, restart ? 0 : captionIndex);
}

// speechSynthesis.pause() is unreliable across browsers, so stop and remember the word instead.
function pausePlayback() {
    if (playbackPaused) return;
    playbackPaused = true;
    stopCaptionTimer();
    stopPlayback();
    setPausedUi(activePostEl, true);
}

function resumePlayback() {
    playbackPaused = false;
    setPausedUi(activePostEl, false);
    if (!activePostEl || !activePostData) return;
    if (!speechUnlocked && !settings.muted) {
        tapToPlay.dataset.show = "1";
        return;
    }
    speakFrom(activePostEl, activePostData, captionIndex);
}

function togglePause() {
    if (playbackPaused) resumePlayback();
    else pausePlayback();
}

function setMuted(muted) {
    settings.muted = !!muted;
    saveSettings();
    document.querySelectorAll(".muteBtn").forEach(btn => {
        if (muted) btn.dataset.muted = "1";
        else delete btn.dataset.muted;
        if (btn._actionLabel) btn._actionLabel.textContent = muted ? "Muted" : "Sound";
    });
    if (!activePostEl || !activePostData || playbackPaused) return;
    speakFrom(activePostEl, activePostData, captionIndex);
}

function setPlaybackRate(rate) {
    playbackRate = rate;
    if (activePostEl) {
        const badge = activePostEl.querySelector(".speedBadge");
        if (badge) {
            if (rate > 1) badge.dataset.show = "1";
            else delete badge.dataset.show;
        }
    }
    if (playbackPaused || !activePostEl || !activePostData) return;
    // Web Speech can't change rate mid-utterance, so restart from the current word.
    speakFrom(activePostEl, activePostData, captionIndex);
}

function clearLike(postEl, post) {
    const likeBtn = postEl?.querySelector?.(".likeBtn") || postEl;
    if (!likeBtn?.dataset?.liked) return false;
    delete likeBtn.dataset.liked;
    likedPosts = likedPosts.filter(id => id != post.id);
    if (likeBtn.dataset.engaged) {
        engagePost(post, -Number(likeBtn.dataset.engaged));
        delete likeBtn.dataset.engaged;
    }
    likeBtn.setAttribute("aria-label", "Like");
    if (likeBtn._actionLabel) likeBtn._actionLabel.textContent = "Like";
    return true;
}

function clearDislike(postEl, post) {
    const dislikeBtn = postEl?.querySelector?.(".dislikeBtn") || postEl;
    if (!dislikeBtn?.dataset?.disliked) return false;
    delete dislikeBtn.dataset.disliked;
    dislikedPosts = dislikedPosts.filter(id => id != post.id);
    if (dislikeBtn.dataset.engaged) {
        engagePost(post, -Number(dislikeBtn.dataset.engaged));
        delete dislikeBtn.dataset.engaged;
    }
    dislikeBtn.setAttribute("aria-label", "Dislike");
    if (dislikeBtn._actionLabel) dislikeBtn._actionLabel.textContent = "Dislike";
    return true;
}

function likePost(postEl, post, likeBtn, clientX, clientY) {
    if (likeBtn.dataset.liked) {
        clearLike(likeBtn, post);
        setTimeout(saveProfile, 100);
        return;
    }
    clearDislike(postEl, post);
    likeBtn.dataset.liked = "1";
    if (!likedPosts.includes(post.id))
        likedPosts.push(post.id);
    if (!likeBtn.dataset.engaged)
        likeBtn.dataset.engaged = engagePost(post, 50 + postsWithoutLike * 4);
    postsWithoutLike = 0;
    likeBtn.setAttribute("aria-label", "Unlike");
    if (likeBtn._actionLabel) likeBtn._actionLabel.textContent = "Liked";
    setTimeout(saveProfile, 100);
    if (clientX != null && clientY != null) {
        const rect = postEl.getBoundingClientRect();
        const burst = document.createElement("div");
        burst.className = "heartBurst";
        burst.style.left = `${clientX - rect.left}px`;
        burst.style.top = `${clientY - rect.top}px`;
        postEl.appendChild(burst);
        setTimeout(() => burst.remove(), 700);
    }
}

function dislikePost(postEl, post, dislikeBtn) {
    if (dislikeBtn.dataset.disliked) {
        clearDislike(dislikeBtn, post);
        setTimeout(saveProfile, 100);
        return;
    }
    clearLike(postEl, post);
    dislikeBtn.dataset.disliked = "1";
    if (!dislikedPosts.includes(post.id))
        dislikedPosts.push(post.id);
    if (!dislikeBtn.dataset.engaged)
        dislikeBtn.dataset.engaged = engagePost(post, -(50 + postsWithoutLike * 4));
    postsWithoutLike = 0;
    dislikeBtn.setAttribute("aria-label", "Remove dislike");
    if (dislikeBtn._actionLabel) dislikeBtn._actionLabel.textContent = "Disliked";
    setTimeout(saveProfile, 100);
}

function openDescription(postEl, post) {
    descPostEl = postEl;
    document.getElementById("descTitle").innerText = post.title;
    document.getElementById("descSummary").innerText = post.text;
    const linksEl = document.getElementById("descLinks");
    linksEl.innerHTML = "";
    const related = findRelatedInSummary(post);
    related.forEach(rel => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.innerText = rel.title;
        btn.onclick = () => {
            descriptionSheet.close();
            jumpToRelatedPost(postEl, rel.page);
        };
        linksEl.appendChild(btn);
    });
    document.getElementById("descOpenArticle").onclick = () => {
        window.open(getArticleLink(post.title, true));
        if (!postEl.dataset.articleEngaged)
            postEl.dataset.articleEngaged = engagePost(post, 75);
        setTimeout(saveProfile, 100);
    };
    pausePlayback();
    descriptionSheet.showModal();
}

descriptionSheet.querySelectorAll(".closeDesc").forEach(btn => {
    btn.onclick = () => descriptionSheet.close();
});
descriptionSheet.addEventListener("close", () => {
    if (activePostEl && !followingPageIsOpen()) resumePlayback();
});

function markPostSeen(post) {
    post.seen = (post.seen ?? 0) + 1;
    seenPosts.push(post.id);
    const timeSpent = Math.min(10000, Date.now() - lastSpentTime);
    lastSpentTime = Date.now();
    timeSpentTotal += timeSpent;
    timeSpentSession += timeSpent;
    postsWithoutLike++;
}

function getNextPost() {
    const potentialPosts = [...Array(10000)].map(e=>pagesArr[Math.floor(Math.random()*pagesArr.length)]).map(post => {
        const initialScore = (post.thumb ? 5 : 0)
            + (3**(post.seen??0)-1)*-50000
            + (dislikedPosts.includes(post.id) ? -100000 : 0)
            + (likedPosts.includes(post.id) ? 25 : 0);
        const postScore = [...post.allCategories].reduce((sum, cat) => sum + (categoryScores[cat]??0), initialScore);
        post.score = postScore;
        return post;
    });

    let highestScore = -Infinity;
    let bestPost = potentialPosts[0];

    if (Math.random() < 0.4) {
        const minScore = Math.min(...potentialPosts.map(e => e.score));
        const maxScore = potentialPosts.reduce((sum, post) => sum + post.score - minScore, 0);
        const targetScore = Math.random()*maxScore;
        let scoreCount = 0;
    
        while (scoreCount < targetScore && potentialPosts.length) {
            const potentialPost = potentialPosts.pop();
            bestPost = potentialPost;
            scoreCount += potentialPost.score - minScore;
        }
    } else if (Math.random()>0.3)
        potentialPosts.forEach(post => {
            if (post.score > highestScore) {
                bestPost = post;
                highestScore = post.score;
            }
        });
    markPostSeen(bestPost);
    return bestPost;
}

const CAP_ARTICLES = new Set(["a", "an", "the"]);
const CAP_PREPOSITIONS = new Set([
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "as", "into", "about", "than",
    "over", "after", "before", "between", "under", "through", "during", "without", "within",
    "along", "across", "behind", "beyond", "against", "among", "around", "beside", "besides",
    "except", "inside", "outside", "near", "off", "onto", "toward", "towards", "upon", "via",
    "per", "plus", "versus", "vs", "like", "unlike", "since", "until", "till", "up", "down", "out",
]);
const CAP_PRONOUNS = new Set([
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your",
    "his", "its", "our", "their", "mine", "yours", "hers", "ours", "theirs", "myself", "yourself",
    "himself", "herself", "itself", "ourselves", "themselves", "this", "that", "these", "those",
    "who", "whom", "whose", "which", "what", "whoever", "whichever", "whatever", "someone",
    "somebody", "something", "anyone", "anybody", "anything", "everyone", "everybody", "everything",
    "no one", "nobody", "nothing", "one", "ones", "another", "other", "others", "each", "every",
    "either", "neither", "both", "few", "many", "much", "most", "some", "any", "all", "several",
]);
const CAP_CONJUNCTIONS = new Set([
    "and", "or", "but", "nor", "so", "yet", "because", "although", "though", "while", "whereas",
    "if", "unless", "until", "when", "whenever", "where", "wherever", "whether", "once", "since",
    "after", "before", "than", "that", "as", "also", "then", "thus", "hence", "therefore",
]);
const CAP_VERBS = new Set([
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
const CAP_ADJECTIVES = new Set([
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
const CAP_ADVERBS = new Set([
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
const CAP_MONTHS = new Set([
    "january", "february", "march", "april", "may", "june", "july", "august", "september",
    "october", "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep",
    "sept", "oct", "nov", "dec",
]);
const CAP_WEEKDAYS = new Set([
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
]);

function classifyCaptionToken(raw, { isLinked = false, isFirst = false } = {}) {
    if (isLinked) return "link";
    const token = normalizeCaptionToken(raw);
    if (!token) return "other";
    if (CAP_MONTHS.has(token) || CAP_WEEKDAYS.has(token)) return "date";
    if (/^\d{1,4}(st|nd|rd|th)?$/.test(token) && token.length >= 3 && /^\d{3,4}/.test(token))
        return "date";
    if (/^\d{1,4}[-–—/]\d{1,4}$/.test(token) || /^\d{4}s$/.test(token))
        return "date";
    if (/^\d/.test(token) || /[%$€£]/.test(raw))
        return "number";
    if (CAP_ARTICLES.has(token)) return "article";
    if (CAP_PREPOSITIONS.has(token)) return "preposition";
    if (CAP_PRONOUNS.has(token)) return "pronoun";
    if (CAP_CONJUNCTIONS.has(token)) return "conjunction";
    if (CAP_VERBS.has(token)) return "verb";
    if (CAP_ADVERBS.has(token) || (token.length > 3 && token.endsWith("ly") && !CAP_ADJECTIVES.has(token)))
        return "adverb";
    if (CAP_ADJECTIVES.has(token)) return "adjective";
    // Capitalized content words (not sentence start) lean proper-noun → noun
    const surface = String(raw || "").trim();
    if (!isFirst && /^[A-Z]/.test(surface) && token.length > 1) return "noun";
    if (token.endsWith("ing") || token.endsWith("ed")) return "verb";
    return "noun";
}

function applyCaptionRoles(spans) {
    spans.forEach((span, i) => {
        const role = classifyCaptionToken(span.textContent, {
            isLinked: !!span.dataset.linkId,
            isFirst: i === 0,
        });
        span.dataset.capRole = role;
        span.style.setProperty("--cap-color", CAP_ROLE_COLORS[role] || CAP_ROLE_COLORS.other);
    });
}

function buildCaptionWords(container, text, post) {
    container.innerHTML = "";
    const parts = text.trim().split(/\s+/).filter(Boolean);
    parts.forEach((word, i) => {
        const span = document.createElement("span");
        span.className = "caption-word";
        span.textContent = word + (i < parts.length - 1 ? " " : "");
        container.appendChild(span);
    });
    const spans = [...container.querySelectorAll(".caption-word")];
    if (post) tagCaptionLinkWords(spans, post);
    applyCaptionRoles(spans);
    return spans;
}

function normalizeCaptionToken(raw) {
    return String(raw || "").toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

// Mark caption spans that form an in-summary wiki link so the visual can
// show that article's picture while the linked words are spoken.
function tagCaptionLinkWords(spans, post) {
    const related = findRelatedInSummary(post);
    post._relatedInSummary = related;
    if (!related.length) return related;
    const tokens = spans.map(s => normalizeCaptionToken(s.textContent));
    const assigned = new Array(spans.length).fill(null);
    for (const rel of related) {
        const titleParts = rel.title.split(/\s+/).map(normalizeCaptionToken).filter(Boolean);
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
            for (let j = 0; j < titleParts.length; j++) {
                assigned[i + j] = rel;
                spans[i + j].dataset.linkId = String(rel.id);
                spans[i + j].dataset.linkTitle = rel.title;
                spans[i + j].classList.add("caption-link");
            }
        }
    }
    return related;
}

function normalizeFileTitle(name) {
    if (!name) return "";
    let t = String(name).trim();
    t = t.replace(/^\[\[/, "").replace(/\]\]$/, "");
    t = t.split("|")[0].trim();
    t = t.replace(/^File:/i, "").replace(/^Image:/i, "").trim();
    return t.replace(/ /g, "_");
}

function commonsThumbUrl(fileTitle, width = 720) {
    const name = normalizeFileTitle(fileTitle);
    if (!name) return "";
    return `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(name)}&width=${width}`;
}

function isUsefulArticleImage(fileTitle, mime) {
    if (!fileTitle) return false;
    if (mime && !String(mime).startsWith("image/")) return false;
    if (/\.(pdf|djvu|ogg|ogv|oga|webm|mid|midi|wav|mp3|flac|opus)(?:$|\?)/i.test(fileTitle))
        return false;
    if (JUNK_IMAGE_RE.test(fileTitle)) return false;
    return true;
}

async function fetchArticleImages(title, fallbackThumb, localImages) {
    const cacheKey = title;
    if (articleImageCache.has(cacheKey))
        return articleImageCache.get(cacheKey);

    const seed = [];
    const seen = new Set();
    const pushName = (raw) => {
        const name = normalizeFileTitle(raw);
        if (!name || !isUsefulArticleImage(name)) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        seed.push(name);
    };
    (localImages || []).forEach(pushName);
    pushName(fallbackThumb);

    const promise = (async () => {
        try {
            const url = new URL("https://simple.wikipedia.org/w/api.php");
            url.searchParams.set("action", "query");
            url.searchParams.set("format", "json");
            url.searchParams.set("origin", "*");
            url.searchParams.set("generator", "images");
            url.searchParams.set("titles", title);
            url.searchParams.set("prop", "imageinfo");
            url.searchParams.set("iiprop", "url|mime|size");
            url.searchParams.set("iiurlwidth", "720");
            url.searchParams.set("gimlimit", "50");
            const res = await fetch(url);
            if (!res.ok) throw new Error(`images ${res.status}`);
            const data = await res.json();
            const pages = data?.query?.pages || {};
            const names = [...seed];
            const have = new Set(names.map(n => n.toLowerCase()));
            for (const page of Object.values(pages)) {
                const fileTitle = page.title || "";
                const info = page.imageinfo?.[0];
                const mime = info?.mime || "";
                if (!isUsefulArticleImage(fileTitle, mime)) continue;
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
    articleImageCache.set(cacheKey, promise);
    return promise;
}

function stopImageSlideshow(postEl) {
    if (!postEl) return;
    if (postEl._slideTimer) {
        clearInterval(postEl._slideTimer);
        postEl._slideTimer = null;
    }
}

function ownMediaImages(visual) {
    return [...visual.querySelectorAll("img.media:not([data-link])")];
}

function showSlideImage(visual, index) {
    const imgs = ownMediaImages(visual);
    if (!imgs.length) return 0;
    const i = ((index % imgs.length) + imgs.length) % imgs.length;
    [...visual.querySelectorAll("img.media")].forEach(img => delete img.dataset.active);
    imgs[i].dataset.active = "1";
    return i;
}

function ensureLinkedArticleImage(visual, page) {
    if (!visual || !page?.thumb) return null;
    let img = visual.querySelector(`img.media[data-link="${page.id}"]`);
    if (img) return img;
    const file = normalizeFileTitle(page.thumb);
    if (!file || !isUsefulArticleImage(file)) return null;
    img = makeMediaImg(commonsThumbUrl(file));
    img.dataset.link = String(page.id);
    img.dataset.file = file.toLowerCase();
    img._visual = visual;
    visual.appendChild(img);
    return img;
}

function showLinkedArticleImage(postEl, pageId) {
    if (!postEl) return;
    const visual = postEl.querySelector(".visual");
    if (!visual) return;
    stopImageSlideshow(postEl);
    postEl._showingLink = String(pageId);
    [...visual.querySelectorAll("img.media")].forEach(img => {
        if (img.dataset.link === String(pageId)) img.dataset.active = "1";
        else delete img.dataset.active;
    });
}

function clearLinkedArticleImage(postEl) {
    if (!postEl || !postEl._showingLink) return;
    postEl._showingLink = null;
    const visual = postEl.querySelector(".visual");
    if (!visual) return;
    visual.querySelectorAll("img.media[data-link]").forEach(img => delete img.dataset.active);
    const own = ownMediaImages(visual);
    if (own.length) {
        const i = showSlideImage(visual, postEl._slideIndex || 0);
        postEl._slideIndex = i;
    }
    if (activePostEl === postEl && !playbackPaused)
        startImageSlideshow(postEl);
}

function syncCaptionLinkedImage(postEl, wordEl) {
    if (!postEl) return;
    const linkId = wordEl?.dataset?.linkId || null;
    if (linkId) {
        if (postEl._showingLink !== String(linkId))
            showLinkedArticleImage(postEl, linkId);
        return;
    }
    clearLinkedArticleImage(postEl);
}

function startImageSlideshow(postEl) {
    if (!postEl) return;
    stopImageSlideshow(postEl);
    if (postEl._showingLink) return;
    const visual = postEl.querySelector(".visual");
    if (!visual) return;
    const imgs = ownMediaImages(visual);
    if (imgs.length <= 1) {
        if (imgs[0]) {
            [...visual.querySelectorAll("img.media")].forEach(img => delete img.dataset.active);
            imgs[0].dataset.active = "1";
        }
        return;
    }
    let i = showSlideImage(visual, postEl._slideIndex || 0);
    postEl._slideTimer = setInterval(() => {
        if (playbackPaused && activePostEl === postEl) return;
        if (postEl._showingLink) return;
        i = showSlideImage(visual, i + 1);
        postEl._slideIndex = i;
    }, IMAGE_SLIDE_MS);
}

function makeMediaImg(src) {
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
        const left = ownMediaImages(visual);
        if (left.length === 1) left[0].dataset.active = "1";
        else if (left.length > 1 && !visual.querySelector("img.media:not([data-link])[data-active]"))
            left[0].dataset.active = "1";
    };
    return img;
}

async function hydratePostImages(postEl, post) {
    const visual = postEl.querySelector(".visual");
    if (!visual) return;
    const names = await fetchArticleImages(post.title, post.thumb, post.images);
    post.images = names;
    const existing = new Set(
        [...visual.querySelectorAll("img.media:not([data-link])")].map(img => img.dataset.file || "")
    );
    names.forEach((name) => {
        const key = name.toLowerCase();
        if (existing.has(key)) return;
        const img = makeMediaImg(commonsThumbUrl(name));
        img.dataset.file = key;
        img._visual = visual;
        visual.appendChild(img);
        existing.add(key);
    });
    const related = post._relatedInSummary || findRelatedInSummary(post);
    related.forEach(rel => ensureLinkedArticleImage(visual, rel.page));
    if (!postEl._showingLink && !visual.querySelector("img.media:not([data-link])[data-active]")) {
        const first = visual.querySelector("img.media:not([data-link])");
        if (first) first.dataset.active = "1";
    }
    if (activePostEl === postEl && !postEl._showingLink)
        startImageSlideshow(postEl);
}

function buildPostElement(post) {
    const postDiv = document.createElement("article");
    postDiv.classList.add("post");
    postDiv.dataset.postId = post.id;
    postDiv._slideIndex = 0;

    const visual = document.createElement("div");
    visual.className = "visual";
    const initial = normalizeFileTitle(post.thumb);
    if (initial) {
        const postImg = makeMediaImg(commonsThumbUrl(initial));
        postImg.dataset.file = initial.toLowerCase();
        postImg.dataset.active = "1";
        postImg.loading = "eager";
        postImg._visual = visual;
        visual.appendChild(postImg);
    }
    postDiv.appendChild(visual);
    hydratePostImages(postDiv, post);

    const speedBadge = document.createElement("div");
    speedBadge.className = "speedBadge";
    speedBadge.textContent = "⏩";
    speedBadge.setAttribute("aria-hidden", "true");
    postDiv.appendChild(speedBadge);

    const pauseIcon = document.createElement("div");
    pauseIcon.className = "pauseIcon";
    pauseIcon.setAttribute("aria-hidden", "true");
    pauseIcon.textContent = "⏸️";
    pauseIcon.addEventListener("animationend", () => delete pauseIcon.dataset.flash);
    postDiv.appendChild(pauseIcon);

    const progress = document.createElement("div");
    progress.className = "playbackProgress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", "Narration progress");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", "0");
    progress.style.setProperty("--progress", "0%");
    postDiv.appendChild(progress);

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const meta = document.createElement("div");
    meta.className = "postMeta";
    const sourceLine = document.createElement("p");
    sourceLine.className = "sourceLine";
    const postTitle = document.createElement("h1");
    postTitle.innerText = post.title;
    const captions = document.createElement("div");
    captions.className = "captions";
    captions.setAttribute("aria-live", "polite");
    buildCaptionWords(captions, post.text, post);
    const sr = document.createElement("p");
    sr.className = "sr-only";
    sr.innerText = post.text;
    meta.appendChild(sourceLine);
    meta.appendChild(postTitle);
    meta.appendChild(captions);
    meta.appendChild(sr);
    overlay.appendChild(meta);
    postDiv.appendChild(overlay);

    const side = document.createElement("div");
    side.className = "sideActions";
    const avatar = document.createElement("div");
    avatar.className = "wikiAvatar";
    avatar.setAttribute("role", "img");
    side.appendChild(avatar);
    hydrateArticleAvatar(avatar, post, sourceLine);

    const makeActionItem = (button, labelText) => {
        const item = document.createElement("div");
        item.className = "actionItem";
        const label = document.createElement("span");
        label.className = "actionLabel";
        label.textContent = labelText;
        button._actionLabel = label;
        item.appendChild(button);
        item.appendChild(label);
        return item;
    };

    const likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = "iconBtn likeBtn";
    likeBtn.setAttribute("aria-label", "Like");
    if (likedPosts.includes(post.id)) {
        likeBtn.dataset.liked = "1";
        likeBtn.setAttribute("aria-label", "Unlike");
    }
    likeBtn.onclick = (e) => {
        e.stopPropagation();
        likePost(postDiv, post, likeBtn, e.clientX, e.clientY);
    };
    const dislikeBtn = document.createElement("button");
    dislikeBtn.type = "button";
    dislikeBtn.className = "iconBtn dislikeBtn";
    dislikeBtn.setAttribute("aria-label", "Dislike");
    if (dislikedPosts.includes(post.id)) {
        dislikeBtn.dataset.disliked = "1";
        dislikeBtn.setAttribute("aria-label", "Remove dislike");
    }
    dislikeBtn.onclick = (e) => {
        e.stopPropagation();
        dislikePost(postDiv, post, dislikeBtn);
    };
    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "iconBtn shareBtn";
    shareBtn.setAttribute("aria-label", "Share article");
    shareBtn.onclick = (e) => {
        e.stopPropagation();
        shareArticle(post, shareBtn);
    };
    const muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "iconBtn muteBtn";
    muteBtn.setAttribute("aria-label", "Mute");
    if (settings.muted) muteBtn.dataset.muted = "1";
    muteBtn.onclick = (e) => {
        e.stopPropagation();
        setMuted(!settings.muted);
    };
    const descBtn = document.createElement("button");
    descBtn.type = "button";
    descBtn.className = "iconBtn descBtn";
    descBtn.innerText = "Description";
    descBtn.onclick = (e) => {
        e.stopPropagation();
        openDescription(postDiv, post);
    };
    side.appendChild(makeActionItem(likeBtn, likeBtn.dataset.liked ? "Liked" : "Like"));
    side.appendChild(makeActionItem(dislikeBtn, dislikeBtn.dataset.disliked ? "Disliked" : "Dislike"));
    side.appendChild(makeActionItem(shareBtn, "Share"));
    side.appendChild(makeActionItem(muteBtn, settings.muted ? "Muted" : "Sound"));
    side.appendChild(makeActionItem(descBtn, "More"));
    postDiv.appendChild(side);

    bindPostGestures(postDiv, post, likeBtn);
    postDiv._postData = post;
    return postDiv;
}

function bindPostGestures(postDiv, post, likeBtn) {
    postDiv.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".sideActions, .iconBtn, a, button")) return;
        pointerDownAt = Date.now();
        pointerStart = { x: e.clientX, y: e.clientY };
        gestureMoved = false;
        holdingSpeed = false;
        holdTimer = setTimeout(() => {
            if (gestureMoved || activePostEl !== postDiv) return;
            holdingSpeed = true;
            setPlaybackRate(2);
        }, 320);
    });
    postDiv.addEventListener("pointermove", (e) => {
        if (!pointerStart) return;
        if (Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 12) {
            gestureMoved = true;
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
            if (holdingSpeed) {
                holdingSpeed = false;
                setPlaybackRate(1);
            }
        }
    });
    const endPointer = (e) => {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        if (holdingSpeed) {
            holdingSpeed = false;
            setPlaybackRate(1);
            pointerStart = null;
            return;
        }
        if (gestureMoved || !pointerStart) {
            pointerStart = null;
            return;
        }
        if (e.target.closest(".sideActions, .iconBtn, a, button")) {
            pointerStart = null;
            return;
        }
        const now = Date.now();
        if (now - lastTapAt < DOUBLE_TAP_MS) {
            if (pendingTapTimer) {
                clearTimeout(pendingTapTimer);
                pendingTapTimer = null;
            }
            lastTapAt = 0;
            likePost(postDiv, post, likeBtn, e.clientX, e.clientY);
        } else {
            lastTapAt = now;
            pendingTapTimer = setTimeout(() => {
                pendingTapTimer = null;
                if (activePostEl === postDiv)
                    togglePause();
            }, DOUBLE_TAP_MS);
        }
        pointerStart = null;
    };
    postDiv.addEventListener("pointerup", endPointer);
    postDiv.addEventListener("pointercancel", () => {
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = null;
        if (holdingSpeed) {
            holdingSpeed = false;
            setPlaybackRate(1);
        }
        pointerStart = null;
    });
}

function setActivePost(postEl, forceSpeak) {
    if (!postEl) return;
    if (activePostEl === postEl && !forceSpeak) return;
    if (activePostEl && activePostEl !== postEl) {
        if (!activePostEl.dataset.scrollEngaged && activePostEl._postData) {
            activePostEl.dataset.scrollEngaged = engagePost(activePostEl._postData, -5);
        }
        setPausedUi(activePostEl, false);
        stopImageSlideshow(activePostEl);
    }
    activePostEl = postEl;
    activePostData = postEl._postData;
    playbackRate = 1;
    playbackPaused = false;
    startImageSlideshow(postEl);
    speakPost(postEl, activePostData, { restart: true });
    ensurePrefetch();
    setTimeout(saveProfile, 100);
}

function ensureFeedObserver() {
    if (feedObserver) return;
    feedObserver = new IntersectionObserver((entries) => {
        let best = null;
        let bestRatio = 0;
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
                bestRatio = entry.intersectionRatio;
                best = entry.target;
            }
        });
        if (best && bestRatio >= 0.6)
            setActivePost(best);
        ensurePrefetch();
    }, {
        root: postsRoot(),
        threshold: [0.6, 0.85, 1],
    });
}

function observePost(postEl) {
    ensureFeedObserver();
    feedObserver.observe(postEl);
}

function appendPost(post) {
    const el = buildPostElement(post);
    postsRoot().appendChild(el);
    observePost(el);
    return el;
}

function createNextPost() {
    if (!pagesArr.length) return null;
    return appendPost(getNextPost());
}

function ensurePrefetch() {
    const root = postsRoot();
    if (!root || !pagesArr.length) return;
    while (root.children.length < PREFETCH_AHEAD)
        createNextPost();
    if (!activePostEl) return;
    const posts = [...root.querySelectorAll(".post")];
    const idx = posts.indexOf(activePostEl);
    while (posts.length - idx - 1 < PREFETCH_AHEAD) {
        createNextPost();
        posts.push(root.lastElementChild);
    }
}

function jumpToRelatedPost(fromEl, page) {
    engagePost(page, 75);
    markPostSeen(page);
    setTimeout(saveProfile, 100);
    const el = buildPostElement(page);
    fromEl.after(el);
    observePost(el);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => setActivePost(el, true));
    ensurePrefetch();
}

function unlockSpeechAndPlay() {
    speechUnlocked = true;
    delete tapToPlay.dataset.show;
    if (activePostEl && activePostData && !settings.muted) {
        speakPost(activePostEl, activePostData, { restart: true });
    }
}

tapToPlay.onclick = () => unlockSpeechAndPlay();

function startFeed() {
    ensurePrefetch();
    const first = postsRoot().querySelector(".post");
    if (first) setActivePost(first, true);
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) pausePlayback();
});

document.addEventListener("keydown", (e) => {
    if (followingPageIsOpen()) return;
    if (descriptionSheet.open || settingsModal.open || profilesModal.open || statsModal.open || aboutModal.open)
        return;
    const root = postsRoot();
    if (!root || !activePostEl) return;
    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") {
        e.preventDefault();
        const next = activePostEl.nextElementSibling;
        if (next) next.scrollIntoView({ behavior: "smooth", block: "start" });
        else {
            const created = createNextPost();
            created?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    } else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
        e.preventDefault();
        const prev = activePostEl.previousElementSibling;
        if (prev) prev.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePause();
    } else if (e.key === "m") {
        setMuted(!settings.muted);
    }
});

[profilesModal, statsModal, settingsModal, aboutModal].forEach(modal => {
    modal.addEventListener("close", () => {
        if (activePostEl && !document.hidden && !descriptionSheet.open && !followingPageIsOpen())
            resumePlayback();
    });
});
const _showProfiles = showProfilesModal;
window.showProfilesModal = function() { pausePlayback(); _showProfiles(); };
const _showStats = showStatsModal;
window.showStatsModal = function() { pausePlayback(); _showStats(); };
const _showSettings = showSettingsModal;
window.showSettingsModal = function() { pausePlayback(); _showSettings(); };
const _showAbout = showAboutModal;
window.showAboutModal = function() { pausePlayback(); _showAbout(); };

function addPickableCategory(cat, checked) {
    if (document.querySelector(`.categoryPicker input[data-category="${cat.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`))
        return;
    const picker = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    picker.innerText = `${cat.slice(0,1).toUpperCase()}${cat.slice(1).toLowerCase()}`;
    picker.appendChild(check);
    picker.classList.add("categoryPicker");
    check.dataset.category = cat;
    if (checked)
        check.checked = true;
    categoryPickList.appendChild(picker);
}

async function* streamToAsyncIterable(stream) {
  const reader = stream.getReader()
  try {
while (true) {
  const {done, value} = await reader.read()
  if (done) return
  yield value
}
  } finally {
reader.releaseLock()
  }
}

let lastBytesProgress = 0;
let progressTotal = DATA_SIZE;
function updateProgress(bytesProgress) {
    const nextLabel = formatDataProgress(bytesProgress, progressTotal);
    const prevLabel = formatDataProgress(lastBytesProgress, progressTotal);
    if (nextLabel !== prevLabel) {
        loadStatus(nextLabel);
        lastBytesProgress = bytesProgress;
    }
}

async function getFileWithProgress(url) {
    const resp = await fetch(url, {cache: "force-cache"});
    if (!resp.ok)
        throw new Error(`Failed to load data (${resp.status})`);
    const contentLength = Number(resp.headers.get("Content-Length")) || 0;
    progressTotal = contentLength > 0 ? contentLength : DATA_SIZE;
    let responseSize = 0;
    const chunks = [];
    for await (const chunk of streamToAsyncIterable(resp.body)) {
        chunks.push(chunk);
        responseSize += chunk.length;
        startBtn.innerText = `Loading shorts... (${formatDataProgress(responseSize, progressTotal)})`;
    }
    startBtn.innerText = `Loading shorts... (${formatDataProgress(progressTotal, progressTotal)})`;
    const bytes = new Uint8Array(responseSize);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return JSON.parse(new TextDecoder().decode(bytes));
}

async function checkVersionAsync() {
    try {
        const versionInfo = await (await fetch("version.json", {cache: "no-store"})).json();
        if (versionInfo.html != HTML_VERSION) {
            if (window.swReg) {
                const res = await (await fetch("/clearHtml")).text();
                console.log(res);
            }
            document.location.reload();
            // || versionInfo.sw != settings.swVer
        }
        if (window.swReg) {
            const swVer = await (await fetch("/swVer")).text();
            if (versionInfo.sw != swVer) {
                await window.swReg.update();
                document.location.reload();
            }
        }
        if (settings.dataSize != versionInfo.simple) {
            // todo: handle updating data but only upon user request
        }
    } catch (e) {
        console.error("Couldn't check versions", e);
    }
}

function loadStatus(text) {
    startBtn.innerText = `Loading shorts... (${text})`;
    if (loading)
        loading.innerText = `Loading...\n(${text})`;
}

let downloadFinished = false;
async function main() {
    if (/iPad|iPhone|iPod/.test(navigator.userAgent))
        document.getElementById("iosmessage").style.display = "block";
    loadStatus("loading profile");
    const hasProfile = initProfile();
    if (hasProfile)
        startScreen.style.display = "none";
    else
        startScreen.showPopover();
    bottomNav.inert = true;
    defaultCategories.forEach(e=>addPickableCategory(e));
    loadStatus("waiting 5s for service worker");
    for (let i = 0; i<500; i++) {
        if (window.swReg && (swReg == "err" || window.swReg?.active)) break;
        await new Promise(r => setTimeout(r, 10));
    }
    checkVersionAsync();
    loadStatus("loading data");
    //setTimeout(()=>downloadFinished||loadStatus("this might take a minute on some connections"),5000)
    //const smoldata = await (await fetch("smoldata.json")).json();
    const smoldata = await getFileWithProgress(DATA_URL);
    downloadFinished = true;

    const subCategories = smoldata.subCategories;
    noPageMaps = smoldata.noPageMaps;
    delete smoldata.subCategories;
    delete smoldata.noPageMaps;

    let i = 0;
    const wikiLen = smoldata.pages.length;
    console.log(wikiLen);
    const loading = document.querySelector("#loading");
    let lastFrame = Date.now();
    while (smoldata.pages.length) {
        const e = smoldata.pages.pop();
        const tempPage = {title:e[0],id:e[1],text:e[2],thumb:e[3],categories:e[4],links:e[5],images:e[6]||[]};
        if (i % 1000 == 0 && Date.now() - lastFrame > 20) {
            loadStatus(`${(i/wikiLen*100).toFixed(0)}%`);
            await new Promise(e => requestAnimationFrame(e));
        }
        i++;
        //tempPage.allCategories = [...recursiveCategories(subCategories, [...tempPage.categories], 0), `p:${tempPage.id}`, ...tempPage.links.map(e=>`p:${e}`)];
        tempPage.allCategories = new Set(recursiveCategories(subCategories, [...tempPage.categories], 0));
        tempPage.allCategories.add(`p:${tempPage.id}`);
        tempPage.allCategories.add(...tempPage.links.map(e=>`p:${e}`));
        pagesArr.push(tempPage);
    }
    loadStatus("Loaded");
    loading.remove();
    startBtn.removeAttribute("disabled");
    categorySearchInput.removeAttribute("disabled");
    startBtn.innerText = "I'm an adult, continue";
    startBtn.onclick = () => {
        bottomNav.inert = false;
        document.querySelectorAll(".categoryPicker>input:checked").forEach(e => categoryScores[e.dataset.category] = defaultCategories.includes(e.dataset.category) ? 1000 : 5000);
        document.querySelectorAll(".categoryPicker>input:checked").forEach(e => {
            if (defaultCategories.includes(e.dataset.category)) return;
            const page = pagesArr.find(x=>x.title.toLowerCase()==e.dataset.category);
            if (page)
                engagePost(page, 100);
        });
        startScreen.hidePopover();
        startScreen.remove();
        setTimeout(saveProfile,100);
        document.querySelector('meta[name="theme-color"]').setAttribute("content", "#000000");
        speechUnlocked = true;
        startFeed();
    }
    initProfile();
    if (hasProfile) {
        bottomNav.inert = false;
        startScreen.remove();
        setTimeout(saveProfile,100);
        document.querySelector('meta[name="theme-color"]').setAttribute("content", "#000000");
        startFeed();
        tryUnlockSpeech();
    }
}

function tryUnlockSpeech() {
    if (!window.speechSynthesis) {
        speechUnlocked = true;
        return;
    }
    try {
        const probe = new SpeechSynthesisUtterance(" ");
        probe.volume = 0;
        probe.rate = 2;
        probe.onstart = () => {
            speechUnlocked = true;
            delete tapToPlay.dataset.show;
            if (activePostEl && activePostData && !settings.muted && !playbackPaused)
                speakPost(activePostEl, activePostData, { restart: true });
        };
        probe.onerror = () => {
            tapToPlay.dataset.show = "1";
        };
        speechSynthesis.speak(probe);
        // If speak is ignored without error, show overlay after a beat
        setTimeout(() => {
            if (!speechUnlocked && !settings.muted)
                tapToPlay.dataset.show = "1";
        }, 600);
    } catch {
        tapToPlay.dataset.show = "1";
    }
}


window.onload = main;
