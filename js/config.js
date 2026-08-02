import { basePath } from "./path.js";
import { state } from "./state.js";
state.HTML_VERSION = "2.0.29";

// Loaded from data/*.json before the app starts (see loadAppData).
state.WIKI_LANGUAGES = [];
state.RANGE_CONNECTORS = {};
state.MONTH_NAMES_EN = [];
state.ORDINAL_WORDS = {};
state.ONES = [];
state.TEENS = [];
state.TENS = [];
state.CAP_ROLE_COLORS = {};
state.CAP_ROLE_LABELS = {};
state.TOPIC_GROUPS = [];
state.TOPIC_NOISE_RE = [];
state.JUNK_IMAGE_RE = /(?!)/; // match nothing until config loads

state.candidateQueue = [];
state.prefetchBusy = false;
state.feedReady = false;
state.PREFETCH_AHEAD = 3;
state.RELATED_LINK_CAP = 8;
state.DOUBLE_TAP_MS = 260;
state.IMAGE_SLIDE_MS = 3500;
state.articleImageCache = new Map();
state.summaryLinkRefCache = new Map();
state.APP_DATA_FILES = [
	"data/languages.json",
	"data/topics.json",
	"data/speech.json",
	"data/captions.json",
	"data/junk-images.json",
];

state.fetchJson = async function fetchJson(path) {
	// no-cache: empty-cache hard refresh must still hit the network.
	const res = await fetch(state.basePath(path), { cache: "no-cache" });
	if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
	return res.json();
}

state.loadAppData = async function loadAppData() {
	const [languages, topics, speech, captions, junk] = await Promise.all(
		state.APP_DATA_FILES.map(state.fetchJson)
	);

	state.WIKI_LANGUAGES = languages.languages || [];
	state.RANGE_CONNECTORS = languages.rangeConnectors || {};

	state.defaultCategories = topics.defaultCategories || [];
	state.TOPIC_GROUPS = (topics.groups || []).map(group => ({
		...group,
		patterns: (group.patterns || []).map(source => new RegExp(source, "i")),
	}));
	state.TOPIC_NOISE_RE = (topics.noise || []).map(source => new RegExp(source, "i"));

	state.MONTH_NAMES_EN = speech.monthsEn || [];
	state.ORDINAL_WORDS = speech.ordinals || {};
	state.ONES = speech.ones || [];
	state.TEENS = speech.teens || [];
	state.TENS = speech.tens || [];

	state.CAP_ROLE_COLORS = captions.roleColors || {};
	state.CAP_ROLE_LABELS = captions.roleLabels || {};

	const junkParts = (junk.patterns || []).filter(Boolean);
	state.JUNK_IMAGE_RE = junkParts.length
		? new RegExp(`(?:^File:)?(?:${junkParts.join("|")})`, "i")
		: /(?!)/;
}

export const loadAppData = (...args) => state.loadAppData(...args);
// Live configuration is held in the shared state store because JSON loads
// replace collections. Consumers can use this object without stale snapshots.
export const config = state;
export const getConfig = (name) => state[name];
export const setConfig = (name, value) => (state[name] = value);
