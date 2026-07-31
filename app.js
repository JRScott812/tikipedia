/* PWA stuff */
let installPrompt = null;
const installButton = document.querySelector("#install");

if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone) {
    installButton.classList.remove("hidden");
    installButton.onclick = () => alert("To install Xikipedia as an app on iOS, open the site in Safari, tap the share button, and choose 'Add to Home Screen'.");
} else if (!window.matchMedia('(display-mode: standalone)').matches && !window.chrome) {
    installButton.classList.remove("hidden");
    installButton.onclick = () => alert("To install Xikipedia as an app, either open it in Chrome, or look into how to install PWAs in your web browser.");
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
let likesLen = 0;
let timeSpentSession = 0;
let timeSpentTotal = 0;
let profileName = "Default";

let lastSpentTime = Date.now();

const defaultCategories = ["nature", "science", "animals", "anthropology", "places", "sociology", "art", "mathematics", "games", "technology", "music", "human sexuality"];
let postsWithoutLike = 0;

const HTML_VERSION = "1.2.2";
const CAP_COLOR_LIST = ["#FFE566", "#FF6B9D", "#5CFFB1", "#7AD7FF", "#FFB86C", "#D4A5FF"];
const PREFETCH_AHEAD = 3;
const RELATED_LINK_CAP = 8;

function loadSettings() {
    const baseSettings = {
        storeData: true,
        openMainWiki: true,
        dataSize: 228005406,
        profile: "default",
        profiles: ["default"],
        theme: "theme-auto",
        muted: false,
    };
    const loadedSettings = JSON.parse(localStorage.getItem("xikipedia-settings") ?? '{}');
    const computedSettings = Object.assign(baseSettings, loadedSettings);
    document.querySelector(`#${computedSettings.theme}`).checked = true;
    document.getElementById("setting-storeData").checked = computedSettings.storeData;
    document.getElementById("setting-openMainWiki").checked = computedSettings.openMainWiki;
    return computedSettings;
}

function saveSettings() {
    settings.theme = document.querySelector('[name=theme]:checked')?.id ?? "theme-auto";
    settings.storeData = document.getElementById("setting-storeData").checked;
    settings.openMainWiki = document.getElementById("setting-openMainWiki").checked;
    localStorage.setItem("xikipedia-settings", JSON.stringify(settings));
}

function resetAlgorithm() {
    if (!confirm(`Reset the algorithm and statistics in profile "${profileName}"?`))
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
        timeSpentTotal: 0,
    }
    const loadedProfile = JSON.parse(localStorage.getItem(`xikipedia-profile-${profileId}`) ?? "{}");
    const profile = Object.assign(defaultProfile, loadedProfile);
    categoryScores = profile.categoryScores;
    seenPosts = profile.seenPosts;
    likedPosts = profile.likedPosts;
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
    activePostEl = null;
    activePostData = null;
    if (feedObserver) {
        feedObserver.disconnect();
        feedObserver = null;
    }
    const postsEl = document.querySelector(".posts");
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
    const likedPostsEl = document.getElementById("likedPosts");
    likedPostsEl.innerText = "";
    likedPosts.forEach(postId => {
        const post = pagesArr.find(e=>e.id==postId);
        const link = document.createElement(post ? "a" : "em");
        link.classList.add("likedPostEntry");
        if (post) {
            link.innerText = post.title;
            link.href = getArticleLink(post.title);
        } else {
            link.innerText = `Unknown post (id: ${postId})`;
        }
        likedPostsEl.appendChild(link);
    });
}

function showStatsModal() {
    statsModal.showModal();
    topStatsStale = true;
    likeStatsStale = true;
    document.getElementById("generalStats").innerText = `Posts scrolled (total): ${seenPosts.length}\nPosts scrolled (session): ${seenPosts.length - likesLen}\nTime spent (total): ${textTime(timeSpentTotal)}\nTime spent (session): ${textTime(timeSpentSession)}`;
    document.querySelectorAll("#statsModal details").forEach(e => e.open = false);
}

function showSettingsModal() {
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
        clearInterval(captionTimer);
        captionTimer = null;
    }
}

function stopPlayback() {
    stopCaptionTimer();
    if (window.speechSynthesis)
        speechSynthesis.cancel();
    currentUtterance = null;
    usingBoundarySync = false;
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
        if (idx === i)
            w.style.setProperty("--cap-color", CAP_COLOR_LIST[idx % CAP_COLOR_LIST.length]);
    });
    captionIndex = i;
}

function startTimedCaptions(words, rate) {
    stopCaptionTimer();
    if (!words.length) return;
    const msPerWord = Math.max(120, 280 / (rate || 1));
    let i = 0;
    highlightCaptionWord(0);
    captionTimer = setInterval(() => {
        i++;
        if (i >= words.length) {
            stopCaptionTimer();
            words.forEach(w => {
                w.classList.add("spoken");
                w.classList.remove("active");
            });
            return;
        }
        highlightCaptionWord(i);
    }, msPerWord);
}

function speakPost(postEl, post, { restart = true } = {}) {
    if (!postEl || !post) return;
    const words = [...postEl.querySelectorAll(".caption-word")];
    captionWords = words;
    if (restart) {
        stopPlayback();
        resetCaptionStyles(words);
        captionIndex = 0;
        playbackPaused = false;
    }
    if (settings.muted || !window.speechSynthesis) {
        startTimedCaptions(words, playbackRate);
        return;
    }
    if (!speechUnlocked) {
        tapToPlay.dataset.show = "1";
        startTimedCaptions(words, playbackRate);
        return;
    }

    const text = `${post.title}. ${post.text}`;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = playbackRate;
    utter.volume = 1;
    currentUtterance = utter;
    usingBoundarySync = false;

    utter.onboundary = (ev) => {
        if (ev.name && ev.name !== "word") return;
        usingBoundarySync = true;
        stopCaptionTimer();
        const before = text.slice(0, ev.charIndex);
        const idx = before.trim().length ? before.trim().split(/\s+/).length - 1 : 0;
        highlightCaptionWord(idx);
    };
    utter.onend = () => {
        currentUtterance = null;
        stopCaptionTimer();
        words.forEach(w => {
            w.classList.add("spoken");
            w.classList.remove("active");
        });
    };
    utter.onerror = () => {
        currentUtterance = null;
        if (!usingBoundarySync)
            startTimedCaptions(words, playbackRate);
    };

    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
    // Fallback if boundary events never fire
    setTimeout(() => {
        if (currentUtterance === utter && !usingBoundarySync && !playbackPaused && !settings.muted)
            startTimedCaptions(words, playbackRate);
    }, 400);
}

function pausePlayback() {
    playbackPaused = true;
    stopCaptionTimer();
    if (window.speechSynthesis)
        speechSynthesis.pause();
}

function resumePlayback() {
    playbackPaused = false;
    if (settings.muted) {
        if (activePostEl && activePostData)
            startTimedCaptions([...activePostEl.querySelectorAll(".caption-word")].slice(captionIndex), playbackRate);
        return;
    }
    if (!speechUnlocked) {
        tapToPlay.dataset.show = "1";
        return;
    }
    if (window.speechSynthesis && speechSynthesis.paused) {
        speechSynthesis.resume();
        return;
    }
    if (activePostEl && activePostData)
        speakPost(activePostEl, activePostData, { restart: true });
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
    });
    if (!activePostEl || !activePostData) return;
    if (muted) {
        stopPlayback();
        startTimedCaptions(captionWords.length ? captionWords : [...activePostEl.querySelectorAll(".caption-word")], playbackRate);
    } else if (!playbackPaused) {
        speakPost(activePostEl, activePostData, { restart: true });
    }
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
    if (!window.speechSynthesis || settings.muted || playbackPaused) {
        if (settings.muted && !playbackPaused && captionWords.length)
            startTimedCaptions(captionWords.slice(captionIndex), rate);
        return;
    }
    // Web Speech rate can't update live reliably — restart from current word approx
    if (activePostEl && activePostData && !playbackPaused) {
        const words = captionWords.map(w => w.textContent);
        const remaining = words.slice(captionIndex).join(" ");
        stopPlayback();
        captionWords = [...activePostEl.querySelectorAll(".caption-word")];
        resetCaptionStyles(captionWords);
        captionWords.forEach((w, idx) => {
            if (idx < captionIndex) w.classList.add("spoken");
        });
        const utter = new SpeechSynthesisUtterance(remaining || `${activePostData.title}. ${activePostData.text}`);
        utter.rate = rate;
        currentUtterance = utter;
        usingBoundarySync = false;
        const baseIndex = captionIndex;
        utter.onboundary = (ev) => {
            if (ev.name && ev.name !== "word") return;
            usingBoundarySync = true;
            stopCaptionTimer();
            const before = remaining.slice(0, ev.charIndex);
            const idx = before.trim().length ? before.trim().split(/\s+/).length - 1 : 0;
            highlightCaptionWord(baseIndex + idx);
        };
        utter.onend = () => {
            currentUtterance = null;
            captionWords.forEach(w => {
                w.classList.add("spoken");
                w.classList.remove("active");
            });
        };
        speechSynthesis.speak(utter);
        setTimeout(() => {
            if (currentUtterance === utter && !usingBoundarySync)
                startTimedCaptions(captionWords.slice(baseIndex), rate);
        }, 400);
    }
}

function likePost(postEl, post, likeBtn, clientX, clientY) {
    if (!likeBtn.dataset.liked) {
        likeBtn.dataset.liked = "1";
        likedPosts.push(post.id);
    }
    if (!likeBtn.dataset.engaged)
        likeBtn.dataset.engaged = engagePost(post, 50 + postsWithoutLike * 4);
    postsWithoutLike = 0;
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
    if (activePostEl) resumePlayback();
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
        const initialScore = (post.thumb ? 5 : 0) + (3**(post.seen??0)-1)*-50000;
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

function buildCaptionWords(container, text) {
    container.innerHTML = "";
    const parts = text.trim().split(/\s+/).filter(Boolean);
    parts.forEach((word, i) => {
        const span = document.createElement("span");
        span.className = "caption-word";
        span.textContent = word + (i < parts.length - 1 ? " " : "");
        container.appendChild(span);
    });
    return [...container.querySelectorAll(".caption-word")];
}

function buildPostElement(post) {
    const postDiv = document.createElement("article");
    postDiv.classList.add("post");
    postDiv.dataset.postId = post.id;

    const visual = document.createElement("div");
    visual.className = "visual";
    if (post.thumb) {
        const postImg = document.createElement("img");
        postImg.src = `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${post.thumb.replace(/ /g, '_')}&width=720`;
        postImg.classList.add("media");
        postImg.alt = "";
        postImg.draggable = false;
        postImg.loading = "eager";
        postImg.onerror = () => postImg.remove();
        visual.appendChild(postImg);
    }
    postDiv.appendChild(visual);

    const speedBadge = document.createElement("div");
    speedBadge.className = "speedBadge";
    speedBadge.textContent = "2x";
    postDiv.appendChild(speedBadge);

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const meta = document.createElement("div");
    meta.className = "postMeta";
    const postTitle = document.createElement("h1");
    postTitle.innerText = post.title;
    const captions = document.createElement("div");
    captions.className = "captions";
    captions.setAttribute("aria-live", "polite");
    buildCaptionWords(captions, `${post.title}. ${post.text}`);
    const sr = document.createElement("p");
    sr.className = "sr-only";
    sr.innerText = post.text;
    meta.appendChild(postTitle);
    meta.appendChild(captions);
    meta.appendChild(sr);
    overlay.appendChild(meta);
    postDiv.appendChild(overlay);

    const side = document.createElement("div");
    side.className = "sideActions";
    const likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = "iconBtn likeBtn";
    likeBtn.setAttribute("aria-label", "Like");
    likeBtn.onclick = (e) => {
        e.stopPropagation();
        likePost(postDiv, post, likeBtn, e.clientX, e.clientY);
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
    side.appendChild(likeBtn);
    side.appendChild(muteBtn);
    side.appendChild(descBtn);
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
        if (now - lastTapAt < 320) {
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
            }, 280);
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
    }
    activePostEl = postEl;
    activePostData = postEl._postData;
    playbackRate = 1;
    playbackPaused = false;
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
        if (activePostEl && !document.hidden && !descriptionSheet.open)
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
        startBtn.innerText = `Xikipedia is loading... (${formatDataProgress(responseSize, progressTotal)})`;
    }
    startBtn.innerText = `Xikipedia is loading... (${formatDataProgress(progressTotal, progressTotal)})`;
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
    startBtn.innerText = `Xikipedia is loading... (${text})`;
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
        const tempPage = {title:e[0],id:e[1],text:e[2],thumb:e[3],categories:e[4],links:e[5]};
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
