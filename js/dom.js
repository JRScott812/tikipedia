import { state } from "./state.js";

// Bind DOM nodes once up front. ES modules do not get automatic HTML id globals.
state.installButton = document.querySelector("#install");
state.startBtn = document.getElementById("startBtn");
state.categoryPickList = document.getElementById("categoryPickList");
state.categorySearch = document.getElementById("categorySearch");
state.categorySearchInput = state.categorySearch?.querySelector("input") || null;
state.categorySearchSelect = state.categorySearch?.querySelector("select") || null;
state.bottomNav = document.querySelector(".bottomNav");
state.startScreen = document.getElementById("startScreen");
state.tapToPlay = document.getElementById("tapToPlay");
state.descriptionSheet = document.getElementById("descriptionSheet");
state.profilesPage = document.getElementById("profilesPage");
state.statsPage = document.getElementById("statsPage");
state.settingsPage = document.getElementById("settingsPage");
state.aboutPage = document.getElementById("aboutPage");
state.followingPage = document.getElementById("followingPage");
// Back-compat aliases used by older call sites / window getters.
state.profilesModal = state.profilesPage;
state.statsModal = state.statsPage;
state.settingsModal = state.settingsPage;
state.aboutModal = state.aboutPage;
state.profilesList = document.getElementById("profilesList");
state.storeDataWarning = document.getElementById("storeDataWarning");
state.voiceSelect = document.getElementById("setting-voice");
state.speechRateInput = document.getElementById("setting-speechRate");
state.previewVoiceBtn = document.getElementById("previewVoiceBtn");
state.wikiLangSelect = document.getElementById("setting-wikiLang");
state.postsRoot = () => document.querySelector(".posts");
