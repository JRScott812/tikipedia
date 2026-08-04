/**
 * Caption roles, English speech transforms, voice matching, and TTS lifecycle.
 * Pure helpers take explicit data/lang args — no shared state bag.
 */
import type { AppData } from "./config";
import type { Post, RelatedInSummary, WikiLang } from "../types/wiki";

/** Subset of app data needed for caption speech transforms. */
export type SpeechData = Pick<
	AppData,
	| "monthNamesEn"
	| "ordinalWords"
	| "ones"
	| "teens"
	| "tens"
	| "rangeConnectors"
	| "capRoleColors"
>;

export type CaptionRole =
	| "noun"
	| "verb"
	| "adjective"
	| "adverb"
	| "preposition"
	| "article"
	| "pronoun"
	| "conjunction"
	| "number"
	| "date"
	| "link"
	| "other";

/** Minimal surface used by caption annotation (real spans or fakes). */
export interface CaptionSpanLike {
	textContent: string | null;
	dataset: DOMStringMap | Record<string, string | undefined>;
	classList?: DOMTokenList;
	style: { setProperty(name: string, value: string): void };
	remove(): void;
}

export interface LangInfoLike {
	bcp47: string;
	code?: string;
	label?: string;
	preview?: string;
}

export const CAP_ARTICLES = new Set(["a", "an", "the"]);
export const CAP_PREPOSITIONS = new Set([
	"in",
	"on",
	"at",
	"to",
	"for",
	"of",
	"with",
	"by",
	"from",
	"as",
	"into",
	"about",
	"than",
	"over",
	"after",
	"before",
	"between",
	"under",
	"through",
	"during",
	"without",
	"within",
	"along",
	"across",
	"behind",
	"beyond",
	"against",
	"among",
	"around",
	"beside",
	"besides",
	"except",
	"inside",
	"outside",
	"near",
	"off",
	"onto",
	"toward",
	"towards",
	"upon",
	"via",
	"per",
	"plus",
	"versus",
	"vs",
	"like",
	"unlike",
	"since",
	"until",
	"till",
	"up",
	"down",
	"out"
]);
export const CAP_PRONOUNS = new Set([
	"i",
	"you",
	"he",
	"she",
	"it",
	"we",
	"they",
	"me",
	"him",
	"her",
	"us",
	"them",
	"my",
	"your",
	"his",
	"its",
	"our",
	"their",
	"mine",
	"yours",
	"hers",
	"ours",
	"theirs",
	"myself",
	"yourself",
	"himself",
	"herself",
	"itself",
	"ourselves",
	"themselves",
	"this",
	"that",
	"these",
	"those",
	"who",
	"whom",
	"whose",
	"which",
	"what",
	"whoever",
	"whichever",
	"whatever",
	"someone",
	"somebody",
	"something",
	"anyone",
	"anybody",
	"anything",
	"everyone",
	"everybody",
	"everything",
	"no one",
	"nobody",
	"nothing",
	"one",
	"ones",
	"another",
	"other",
	"others",
	"each",
	"every",
	"either",
	"neither",
	"both",
	"few",
	"many",
	"much",
	"most",
	"some",
	"any",
	"all",
	"several"
]);
export const CAP_CONJUNCTIONS = new Set([
	"and",
	"or",
	"but",
	"nor",
	"so",
	"yet",
	"because",
	"although",
	"though",
	"while",
	"whereas",
	"if",
	"unless",
	"until",
	"when",
	"whenever",
	"where",
	"wherever",
	"whether",
	"once",
	"since",
	"after",
	"before",
	"than",
	"that",
	"as",
	"also",
	"then",
	"thus",
	"hence",
	"therefore"
]);
export const CAP_VERBS = new Set([
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"am",
	"do",
	"does",
	"did",
	"done",
	"doing",
	"have",
	"has",
	"had",
	"having",
	"can",
	"could",
	"will",
	"would",
	"shall",
	"should",
	"may",
	"might",
	"must",
	"need",
	"needs",
	"needed",
	"seem",
	"seems",
	"seemed",
	"become",
	"becomes",
	"became",
	"make",
	"makes",
	"made",
	"making",
	"get",
	"gets",
	"got",
	"getting",
	"go",
	"goes",
	"went",
	"gone",
	"going",
	"come",
	"comes",
	"came",
	"coming",
	"take",
	"takes",
	"took",
	"taken",
	"taking",
	"see",
	"sees",
	"saw",
	"seen",
	"seeing",
	"know",
	"knows",
	"knew",
	"known",
	"knowing",
	"think",
	"thinks",
	"thought",
	"thinking",
	"look",
	"looks",
	"looked",
	"looking",
	"want",
	"wants",
	"wanted",
	"wanting",
	"give",
	"gives",
	"gave",
	"given",
	"giving",
	"use",
	"uses",
	"used",
	"using",
	"find",
	"finds",
	"found",
	"finding",
	"tell",
	"tells",
	"told",
	"telling",
	"ask",
	"asks",
	"asked",
	"asking",
	"work",
	"works",
	"worked",
	"working",
	"call",
	"calls",
	"called",
	"calling",
	"try",
	"tries",
	"tried",
	"trying",
	"leave",
	"leaves",
	"left",
	"leaving",
	"put",
	"puts",
	"putting",
	"mean",
	"means",
	"meant",
	"meaning",
	"keep",
	"keeps",
	"kept",
	"keeping",
	"let",
	"lets",
	"letting",
	"begin",
	"begins",
	"began",
	"begun",
	"beginning",
	"show",
	"shows",
	"showed",
	"shown",
	"showing",
	"hear",
	"hears",
	"heard",
	"hearing",
	"play",
	"plays",
	"played",
	"playing",
	"run",
	"runs",
	"ran",
	"running",
	"move",
	"moves",
	"moved",
	"moving",
	"live",
	"lives",
	"lived",
	"living",
	"believe",
	"believes",
	"believed",
	"believing",
	"hold",
	"holds",
	"held",
	"holding",
	"bring",
	"brings",
	"brought",
	"bringing",
	"happen",
	"happens",
	"happened",
	"happening",
	"write",
	"writes",
	"wrote",
	"written",
	"writing",
	"sit",
	"sits",
	"sat",
	"sitting",
	"stand",
	"stands",
	"stood",
	"standing",
	"lose",
	"loses",
	"lost",
	"losing",
	"pay",
	"pays",
	"paid",
	"paying",
	"meet",
	"meets",
	"met",
	"meeting",
	"include",
	"includes",
	"included",
	"including",
	"continue",
	"continues",
	"continued",
	"continuing",
	"set",
	"sets",
	"setting",
	"learn",
	"learns",
	"learned",
	"learnt",
	"learning",
	"change",
	"changes",
	"changed",
	"changing",
	"lead",
	"leads",
	"led",
	"leading",
	"understand",
	"understands",
	"understood",
	"understanding",
	"watch",
	"watches",
	"watched",
	"watching",
	"follow",
	"follows",
	"followed",
	"following",
	"stop",
	"stops",
	"stopped",
	"stopping",
	"create",
	"creates",
	"created",
	"creating",
	"speak",
	"speaks",
	"spoke",
	"spoken",
	"speaking",
	"read",
	"reads",
	"reading",
	"allow",
	"allows",
	"allowed",
	"allowing",
	"add",
	"adds",
	"added",
	"adding",
	"spend",
	"spends",
	"spent",
	"spending",
	"grow",
	"grows",
	"grew",
	"grown",
	"growing",
	"open",
	"opens",
	"opened",
	"opening",
	"walk",
	"walks",
	"walked",
	"walking",
	"win",
	"wins",
	"won",
	"winning",
	"offer",
	"offers",
	"offered",
	"offering",
	"remember",
	"remembers",
	"remembered",
	"remembering",
	"love",
	"loves",
	"loved",
	"loving",
	"consider",
	"considers",
	"considered",
	"considering",
	"appear",
	"appears",
	"appeared",
	"appearing",
	"buy",
	"buys",
	"bought",
	"buying",
	"wait",
	"waits",
	"waited",
	"waiting",
	"serve",
	"serves",
	"served",
	"serving",
	"die",
	"dies",
	"died",
	"dying",
	"send",
	"sends",
	"sent",
	"sending",
	"build",
	"builds",
	"built",
	"building",
	"stay",
	"stays",
	"stayed",
	"staying",
	"fall",
	"falls",
	"fell",
	"fallen",
	"falling",
	"cut",
	"cuts",
	"cutting",
	"reach",
	"reaches",
	"reached",
	"reaching",
	"kill",
	"kills",
	"killed",
	"killing",
	"remain",
	"remains",
	"remained",
	"remaining",
	"suggest",
	"suggests",
	"suggested",
	"suggesting",
	"raise",
	"raises",
	"raised",
	"raising",
	"pass",
	"passes",
	"passed",
	"passing",
	"sell",
	"sells",
	"sold",
	"selling",
	"require",
	"requires",
	"required",
	"requiring",
	"report",
	"reports",
	"reported",
	"reporting",
	"decide",
	"decides",
	"decided",
	"deciding",
	"pull",
	"pulls",
	"pulled",
	"pulling",
	"return",
	"returns",
	"returned",
	"returning",
	"explain",
	"explains",
	"explained",
	"explaining",
	"hope",
	"hopes",
	"hoped",
	"hoping",
	"develop",
	"develops",
	"developed",
	"developing",
	"carry",
	"carries",
	"carried",
	"carrying",
	"break",
	"breaks",
	"broke",
	"broken",
	"breaking",
	"receive",
	"receives",
	"received",
	"receiving",
	"agree",
	"agrees",
	"agreed",
	"agreeing",
	"support",
	"supports",
	"supported",
	"supporting",
	"hit",
	"hits",
	"hitting",
	"produce",
	"produces",
	"produced",
	"producing",
	"eat",
	"eats",
	"ate",
	"eaten",
	"eating",
	"cover",
	"covers",
	"covered",
	"covering",
	"catch",
	"catches",
	"caught",
	"catching",
	"draw",
	"draws",
	"drew",
	"drawn",
	"drawing",
	"choose",
	"chooses",
	"chose",
	"chosen",
	"choosing",
	"describe",
	"describes",
	"described",
	"describing",
	"contain",
	"contains",
	"contained",
	"containing",
	"exist",
	"exists",
	"existed",
	"existing",
	"form",
	"forms",
	"formed",
	"forming",
	"provide",
	"provides",
	"provided",
	"providing",
	"start",
	"starts",
	"started",
	"starting",
	"help",
	"helps",
	"helped",
	"helping",
	"name",
	"names",
	"named",
	"naming",
	"say",
	"says",
	"said",
	"saying",
	"born",
	"founded",
	"located",
	"called",
	"known"
]);
export const CAP_ADJECTIVES = new Set([
	"new",
	"old",
	"good",
	"great",
	"big",
	"small",
	"large",
	"little",
	"long",
	"short",
	"high",
	"low",
	"early",
	"late",
	"young",
	"important",
	"different",
	"same",
	"own",
	"other",
	"next",
	"last",
	"first",
	"second",
	"third",
	"best",
	"better",
	"worst",
	"worse",
	"free",
	"full",
	"hard",
	"easy",
	"sure",
	"clear",
	"true",
	"false",
	"real",
	"right",
	"left",
	"wrong",
	"main",
	"only",
	"public",
	"private",
	"local",
	"national",
	"international",
	"political",
	"social",
	"human",
	"natural",
	"special",
	"strong",
	"weak",
	"black",
	"white",
	"red",
	"blue",
	"green",
	"yellow",
	"dark",
	"light",
	"hot",
	"cold",
	"warm",
	"cool",
	"open",
	"closed",
	"alive",
	"dead",
	"famous",
	"popular",
	"common",
	"rare",
	"simple",
	"complex",
	"modern",
	"ancient",
	"religious",
	"military",
	"economic",
	"cultural",
	"scientific",
	"medical",
	"legal",
	"official",
	"original",
	"final",
	"possible",
	"available",
	"similar",
	"various",
	"certain",
	"general",
	"personal",
	"major",
	"minor",
	"whole",
	"entire",
	"single",
	"double",
	"multiple",
	"british",
	"american",
	"english",
	"french",
	"german",
	"chinese",
	"japanese",
	"indian",
	"european",
	"african",
	"asian",
	"roman",
	"greek",
	"russian",
	"spanish",
	"italian",
	"canadian",
	"australian",
	"huge",
	"tiny",
	"wide",
	"narrow",
	"deep",
	"thick",
	"thin",
	"heavy",
	"fast",
	"slow",
	"quick",
	"beautiful",
	"ugly",
	"happy",
	"sad",
	"poor",
	"rich",
	"safe",
	"dangerous",
	"useful",
	"unknown"
]);
export const CAP_ADVERBS = new Set([
	"not",
	"also",
	"very",
	"just",
	"even",
	"still",
	"already",
	"always",
	"never",
	"often",
	"sometimes",
	"usually",
	"really",
	"only",
	"almost",
	"enough",
	"quite",
	"rather",
	"too",
	"so",
	"then",
	"now",
	"here",
	"there",
	"away",
	"back",
	"again",
	"once",
	"twice",
	"together",
	"alone",
	"else",
	"ever",
	"ago",
	"soon",
	"later",
	"early",
	"well",
	"badly",
	"fast",
	"slowly",
	"quickly",
	"suddenly",
	"finally",
	"actually",
	"probably",
	"perhaps",
	"maybe",
	"certainly",
	"especially",
	"generally",
	"mainly",
	"mostly",
	"nearly",
	"simply",
	"clearly",
	"directly",
	"exactly",
	"highly",
	"largely",
	"recently",
	"currently",
	"originally",
	"previously",
	"earlier",
	"today",
	"tomorrow",
	"yesterday",
	"tonight",
	"forward",
	"backward",
	"upstairs",
	"downstairs",
	"outside",
	"inside",
	"nearby",
	"far",
	"apart",
	"instead",
	"otherwise"
]);
export const CAP_MONTHS = new Set([
	"january",
	"february",
	"march",
	"april",
	"may",
	"june",
	"july",
	"august",
	"september",
	"october",
	"november",
	"december",
	"jan",
	"feb",
	"mar",
	"apr",
	"jun",
	"jul",
	"aug",
	"sep",
	"sept",
	"oct",
	"nov",
	"dec"
]);
export const CAP_WEEKDAYS = new Set([
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
	"mon",
	"tue",
	"tues",
	"wed",
	"thu",
	"thur",
	"thurs",
	"fri",
	"sat",
	"sun"
]);

export function normalizeCaptionToken(raw: string | null | undefined): string {
	return String(raw || "")
		.toLowerCase()
		.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

/** Tokens like "1928-1938" or "Constantinople" take far longer to say than one plain word. */
export function captionWordWeight(raw: string | null | undefined): number {
	const token = (raw || "").trim();
	if (!token) return 1;
	const digits = (token.match(/\d/g) || []).length;
	const letters = token.replace(/[^A-Za-z]/g, "").length;
	const spokenWords = token.split(/\s+/).filter(Boolean).length;
	let weight = 1 + digits * 0.55 + Math.max(0, letters - 6) * 0.08;
	if (digits >= 4 && /[-–—/]/.test(token)) weight += 0.8;
	// Expanded speak forms ("March fifteenth, nineteen ninety-nine") need multi-word time.
	if (spokenWords > 1) weight = Math.max(weight, spokenWords * 1.25);
	return Math.min(weight, 8);
}

/** Prefer `data-speak` so date/year expansions drive karaoke timing on mobile. */
export function captionTokenWeight(
	word: {
		textContent?: string | null;
		dataset?: { speak?: string | null } | DOMStringMap;
	} | null
): number {
	if (!word) return 1;
	const spoken = String(word.dataset?.speak ?? word.textContent ?? "");
	return captionWordWeight(spoken);
}

/** Per-token delay for timed karaoke (used when speech boundaries are missing). */
export function captionStepMs(
	word: {
		textContent?: string | null;
		dataset?: { speak?: string | null } | DOMStringMap;
	} | null,
	playbackRate: number,
	speechRate: number,
	opts?: { mobile?: boolean }
): number {
	const effective = Math.max(
		0.5,
		Math.min(2, (Number(speechRate) || 1) * (Number(playbackRate) || 1))
	);
	// Mobile voices are often slower than desktop; bias timing slightly longer.
	const base = (opts?.mobile ? 360 : 310) / effective;
	return Math.max(90, base * captionTokenWeight(word));
}

/** iOS/iPadOS Web Speech rarely fires reliable word boundary events. */
export function prefersTimedCaptionSync(): boolean {
	if (typeof navigator === "undefined") return false;
	const ua = navigator.userAgent || "";
	if (/iPhone|iPad|iPod/i.test(ua)) return true;
	// iPadOS 13+ can report as MacIntel with touch.
	if (
		typeof navigator.platform === "string" &&
		navigator.platform === "MacIntel" &&
		(navigator.maxTouchPoints || 0) > 1
	)
		return true;
	return false;
}

/**
 * Maps a speech charIndex to the caption token containing it, so mid-token
 * boundary events (common inside dates and numbers) don't skip ahead.
 */
export function tokenIndexAtChar(spans: number[], charIndex: number): number {
	let lo = 0;
	let hi = spans.length - 1;
	let found = 0;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (spans[mid]! <= charIndex) {
			found = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found;
}

export function classifyCaptionToken(
	raw: string | null | undefined,
	{ isLinked = false, isFirst = false }: { isLinked?: boolean; isFirst?: boolean } = {}
): CaptionRole {
	if (isLinked) return "link";
	const token = normalizeCaptionToken(raw);
	if (!token) return "other";
	if (CAP_MONTHS.has(token) || CAP_WEEKDAYS.has(token)) return "date";
	if (
		/^\d{1,4}(st|nd|rd|th)?$/.test(token) &&
		token.length >= 3 &&
		/^\d{3,4}/.test(token)
	)
		return "date";
	if (/^\d{1,4}[-–—/]\d{1,4}$/.test(token) || /^\d{4}s$/.test(token)) return "date";
	if (/^\d/.test(token) || /[%$€£]/.test(String(raw || ""))) return "number";
	if (CAP_ARTICLES.has(token)) return "article";
	if (CAP_PREPOSITIONS.has(token)) return "preposition";
	if (CAP_PRONOUNS.has(token)) return "pronoun";
	if (CAP_CONJUNCTIONS.has(token)) return "conjunction";
	if (CAP_VERBS.has(token)) return "verb";
	if (
		CAP_ADVERBS.has(token) ||
		(token.length > 3 && token.endsWith("ly") && !CAP_ADJECTIVES.has(token))
	)
		return "adverb";
	if (CAP_ADJECTIVES.has(token)) return "adjective";
	const surface = String(raw || "").trim();
	if (!isFirst && /^[A-Z]/.test(surface) && token.length > 1) return "noun";
	if (token.endsWith("ing") || token.endsWith("ed")) return "verb";
	return "noun";
}

export function applyCaptionRoles(
	spans: CaptionSpanLike[],
	roleColors: Record<string, string>
): void {
	spans.forEach((span, i) => {
		const role = classifyCaptionToken(span.textContent, {
			isLinked: !!span.dataset.linkId,
			isFirst: i === 0
		});
		span.dataset.capRole = role;
		span.style.setProperty("--cap-color", roleColors[role] || roleColors.other || "");
	});
}

export function isEnglishSpeechLang(wikiLang: string | null | undefined): boolean {
	const code = wikiLang || "simple";
	return code === "en" || code === "simple";
}

export function under100(n: number, data: SpeechData): string {
	if (n < 10) return data.ones[n] || "";
	if (n < 20) return data.teens[n - 10] || "";
	const t = Math.floor(n / 10);
	const o = n % 10;
	return o ? `${data.tens[t]}-${data.ones[o]}` : data.tens[t] || "";
}

export function speakYearEn(year: number | string, data: SpeechData): string {
	const y = Number(year);
	if (!Number.isFinite(y) || y < 0) return String(year);
	if (y < 1000) return under100(y, data) || String(y);
	if (y >= 2000 && y <= 2009)
		return y === 2000 ? "two thousand" : `two thousand ${data.ones[y % 10]}`;
	if (y >= 2010 && y <= 2099) {
		const rest = y % 100;
		return rest < 10
			? `two thousand ${data.ones[rest]}`
			: `twenty ${under100(rest, data)}`;
	}
	const century = Math.floor(y / 100);
	const rest = y % 100;
	let head: string;
	if (century >= 10 && century <= 19) head = under100(century, data);
	else if (century >= 20 && century <= 99) head = under100(century, data);
	else head = String(century);
	if (rest === 0) return `${head} hundred`;
	if (rest < 10) return `${head} oh ${data.ones[rest]}`;
	return `${head} ${under100(rest, data)}`;
}

export function speakDecadeEn(token: string, data: SpeechData): string | null {
	const m = String(token).match(/^(\d{3,4})s$/i);
	if (!m) return null;
	const base = Number(m[1]);
	if (base % 10 !== 0) return null;
	if (base % 100 === 0)
		return `${speakYearEn(base, data)}s`.replace(/ hundred$/, " hundreds");
	const spoken = speakYearEn(base, data);
	if (spoken.endsWith("ty")) return `${spoken.slice(0, -1)}ies`;
	return `${spoken}s`;
}

export function stripTrailingPunct(token: string): { core: string; punct: string } {
	const trimmed = String(token || "").trim();
	const m = trimmed.match(/^(.*?)([.,;:!?]+)?$/);
	return { core: m?.[1] ?? trimmed, punct: m?.[2] || "" };
}

export function isMonthToken(token: string, monthNamesEn: string[]): boolean {
	const core = stripTrailingPunct(token).core.toLowerCase().replace(/\.$/, "");
	if (!core) return false;
	return monthNamesEn.some((m) => {
		const month = String(m || "")
			.toLowerCase()
			.replace(/\.$/, "");
		return month === core || (core.length >= 3 && month.startsWith(core));
	});
}

export function isDateContext(
	tokens: string[],
	index: number,
	monthNamesEn: string[]
): boolean {
	const prev = stripTrailingPunct(tokens[index - 1] || "").core.toLowerCase();
	const next = stripTrailingPunct(tokens[index + 1] || "").core.toLowerCase();
	if (
		isMonthToken(tokens[index - 1] || "", monthNamesEn) ||
		isMonthToken(tokens[index + 1] || "", monthNamesEn)
	)
		return true;
	if (/^(c|ca|bc|ad|bce|ce|r)$/i.test(prev) || /^(bc|ad|bce|ce)$/i.test(next))
		return true;
	if (/^(born|died|in|since|until|from|year|years)$/i.test(prev)) return true;
	if (/[–—-]/.test(tokens[index] || "")) return true;
	return false;
}

export function normalizeEraToken(core: string): string | null {
	const t = core.toLowerCase().replace(/\.$/, "");
	if (t === "c" || t === "ca") return "circa";
	if (t === "bc") return "B C";
	if (t === "ad") return "A D";
	if (t === "bce") return "B C E";
	if (t === "ce") return "C E";
	if (t === "r") return "reigned";
	return null;
}

export function speakYearRange(
	token: string,
	lang: string,
	data: SpeechData,
	langBcp47?: string
): string | null {
	const m = String(token).match(/^(\d{3,4})\s*[–—-]\s*(\d{2,4})([.,;:!?]*)$/);
	if (!m) return null;
	const a = Number(m[1]);
	let b = Number(m[2]);
	if (m[2]!.length <= 2) b = Math.floor(a / 100) * 100 + b;
	const connector =
		data.rangeConnectors[lang] ||
		(langBcp47 ? data.rangeConnectors[langBcp47] : undefined) ||
		",";
	if (isEnglishSpeechLang(lang))
		return `${speakYearEn(a, data)} ${connector} ${speakYearEn(b, data)}${m[3] || ""}`;
	return `${a} ${connector} ${b}${m[3] || ""}`;
}

export function tokenSpeechForm(
	tokens: string[],
	index: number,
	data: SpeechData,
	wikiLang: string,
	langBcp47?: string
): string | null {
	const raw = tokens[index]!;
	const { core, punct } = stripTrailingPunct(raw);
	const lang = wikiLang || "simple";
	const range = speakYearRange(raw, lang, data, langBcp47);
	if (range) return range;

	const era = normalizeEraToken(core);
	if (era) return era + (punct ? `${punct} ` : " ");

	if (isEnglishSpeechLang(lang)) {
		const decade = speakDecadeEn(core, data);
		if (decade && isDateContext(tokens, index, data.monthNamesEn))
			return `${decade}${punct || ""} `;

		if (/^\d{3,4}$/.test(core) && isDateContext(tokens, index, data.monthNamesEn))
			return `${speakYearEn(core, data)}${punct || ""} `;

		// Month D, YYYY  /  Month D YYYY
		if (isMonthToken(core, data.monthNamesEn)) {
			const dayTok = tokens[index + 1];
			const yearTok = tokens[index + 2];
			const day = stripTrailingPunct(dayTok || "")
				.core.replace(/,/g, "")
				.replace(/(?:st|nd|rd|th)$/i, "");
			const year = stripTrailingPunct(yearTok || "").core;
			if (/^\d{1,2}$/.test(day) && /^\d{3,4}$/.test(year)) {
				const ord = data.ordinalWords[String(Number(day))] || day;
				return `${core} ${ord}, ${speakYearEn(year, data)} `;
			}
			if (/^\d{1,2}$/.test(day)) {
				const ord = data.ordinalWords[String(Number(day))] || day;
				return `${core} ${ord}${stripTrailingPunct(dayTok || "").punct || ""} `;
			}
		}

		// D Month YYYY
		if (
			/^\d{1,2}(?:st|nd|rd|th)?$/i.test(core) &&
			isMonthToken(tokens[index + 1] || "", data.monthNamesEn)
		) {
			const dayNum = core.replace(/(?:st|nd|rd|th)$/i, "");
			const month = stripTrailingPunct(tokens[index + 1] || "").core;
			const yearTok = tokens[index + 2];
			const year = stripTrailingPunct(yearTok || "").core;
			const ord = data.ordinalWords[String(Number(dayNum))] || dayNum;
			if (/^\d{3,4}$/.test(year))
				return `${ord} of ${month} ${speakYearEn(year, data)} `;
			return `${ord} of ${month}${punct || ""} `;
		}
	} else if (/^\d{3,4}$/.test(core) && /[–—-]/.test(raw)) {
		return speakYearRange(raw, lang, data, langBcp47) || raw;
	}
	return null;
}

export function annotateSpeechTokens(
	spans: CaptionSpanLike[],
	data: SpeechData,
	wikiLang: string,
	langBcp47?: string
): void {
	const display = spans.map((s) => s.textContent || "");
	const spoken = display.map((t) => t);
	/** lead index → indices merged into it (including lead) */
	const mergeGroups = new Map<number, number[]>();
	const consumed = new Set<number>();

	const markMerge = (lead: number, extras: number[]) => {
		const group = [lead, ...extras];
		mergeGroups.set(lead, group);
		for (const idx of extras) consumed.add(idx);
	};

	for (let i = 0; i < display.length; i++) {
		if (consumed.has(i)) continue;
		let form: string | null = null;
		try {
			form = tokenSpeechForm(display, i, data, wikiLang, langBcp47);
		} catch (err) {
			console.warn("tokenSpeechForm failed", display[i], err);
			continue;
		}
		if (!form) continue;
		spoken[i] = form.endsWith(" ") ? form : `${form} `;

		if (
			isEnglishSpeechLang(wikiLang) &&
			isMonthToken(stripTrailingPunct(display[i]!).core, data.monthNamesEn)
		) {
			const day = stripTrailingPunct(display[i + 1] || "")
				.core.replace(/,/g, "")
				.replace(/(?:st|nd|rd|th)$/i, "");
			const year = stripTrailingPunct(display[i + 2] || "").core;
			if (/^\d{1,2}$/.test(day)) {
				const extras = [i + 1];
				if (/^\d{3,4}$/.test(year)) extras.push(i + 2);
				markMerge(i, extras);
			}
		} else if (
			isEnglishSpeechLang(wikiLang) &&
			/^\d{1,2}(?:st|nd|rd|th)?$/i.test(stripTrailingPunct(display[i]!).core) &&
			isMonthToken(display[i + 1] || "", data.monthNamesEn)
		) {
			const extras = [i + 1];
			const year = stripTrailingPunct(display[i + 2] || "").core;
			if (/^\d{3,4}$/.test(year)) extras.push(i + 2);
			markMerge(i, extras);
		}
	}

	for (const [lead, group] of mergeGroups) {
		const span = spans[lead];
		if (!span) continue;
		const merged = group
			.map((idx) => display[idx]!.trim())
			.filter(Boolean)
			.join(" ");
		const trail =
			group.some((idx) => /\s$/.test(display[idx]!)) || lead < spans.length - 1;
		span.textContent = trail && !/\s$/.test(merged) ? `${merged} ` : merged;
		span.dataset.capRole = "date";
		span.style.setProperty(
			"--cap-color",
			data.capRoleColors.date || data.capRoleColors.other || ""
		);
	}

	spans.forEach((span, i) => {
		if (consumed.has(i)) return;
		const displayText = span.textContent;
		const speakText = spoken[i];
		if (speakText !== displayText) span.dataset.speak = speakText;
		else delete span.dataset.speak;
	});

	for (let i = spans.length - 1; i >= 0; i--) {
		if (!consumed.has(i)) continue;
		spans[i]!.remove();
		spans.splice(i, 1);
	}
}

/** Pure speech expansion for plain text (no DOM). */
export function toSpeechText(
	text: string,
	data: SpeechData,
	wikiLang: string,
	langBcp47?: string
): string {
	const parts = String(text || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (!parts.length) return "";

	type FakeSpan = {
		textContent: string;
		dataset: Record<string, string | undefined>;
		style: { setProperty(_name: string, _value: string): void };
		remove(): void;
	};

	const fakeSpans: FakeSpan[] = parts.map((p) => ({
		textContent: `${p} `,
		dataset: {},
		style: { setProperty() {} },
		remove() {}
	}));
	annotateSpeechTokens(fakeSpans, data, wikiLang, langBcp47);
	return fakeSpans
		.map((s) => (s.dataset.speak != null ? s.dataset.speak : s.textContent))
		.join("")
		.trim();
}

/**
 * Mark caption spans that form an in-summary wiki link so the visual can
 * show that article's picture while the linked words are spoken.
 */
export function tagCaptionLinkWords(
	spans: CaptionSpanLike[],
	post: Post,
	options?: {
		related?: RelatedInSummary[];
		findRelated?: (post: Post) => RelatedInSummary[];
	}
): RelatedInSummary[] {
	const related =
		options?.related ?? options?.findRelated?.(post) ?? post._relatedInSummary ?? [];
	// Only cache on the post when discovering summary-related links — section
	// playback passes an explicit `related` list and must not clobber the sheet.
	if (options?.related == null) {
		post._relatedInSummary = related;
	}
	if (!related.length) return related;

	const tokens = spans.map((s) => normalizeCaptionToken(s.textContent));
	const assigned: Array<RelatedInSummary | null> = new Array(spans.length).fill(null);
	const ordered = [...related].sort(
		(a, b) =>
			String(b.label || b.title || "").length -
			String(a.label || a.title || "").length
	);

	for (const rel of ordered) {
		const phrases = [
			...new Set(
				[rel.label, rel.title, ...(rel.page?.aliases || [])].filter(
					Boolean
				) as string[]
			)
		];
		phrases.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
		for (const phrase of phrases) {
			const titleParts = phrase
				.split(/\s+/)
				.map(normalizeCaptionToken)
				.filter(Boolean);
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
					const span = spans[i + j]!;
					span.dataset.linkId = linkId;
					span.dataset.linkTitle = rel.title;
					span.classList?.add("caption-link");
				}
			}
		}
	}
	return related;
}

export function buildCaptionWords(
	container: HTMLElement,
	text: string,
	post: Post | null | undefined,
	data: SpeechData,
	options?: {
		wikiLang?: string;
		langBcp47?: string;
		related?: RelatedInSummary[];
		findRelated?: (post: Post) => RelatedInSummary[];
	}
): HTMLSpanElement[] {
	container.innerHTML = "";
	const parts = text.trim().split(/\s+/).filter(Boolean);
	parts.forEach((word, i) => {
		const span = document.createElement("span");
		span.className = "caption-word";
		span.textContent = word + (i < parts.length - 1 ? " " : "");
		container.appendChild(span);
	});
	const spans = [...container.querySelectorAll<HTMLSpanElement>(".caption-word")];
	if (post) tagCaptionLinkWords(spans, post, options);
	applyCaptionRoles(spans, data.capRoleColors);
	annotateSpeechTokens(
		spans,
		data,
		options?.wikiLang || post?.wikiLang || "simple",
		options?.langBcp47
	);
	return spans;
}

// —— Voice matching ——

export function voiceLangPrefix(bcp47: string | null | undefined): string {
	return (bcp47 || "en").toLowerCase();
}

export function voiceMatchesWiki(
	voice: SpeechSynthesisVoice | null | undefined,
	bcp47: string
): boolean {
	if (!voice?.lang) return false;
	const prefix = voiceLangPrefix(bcp47);
	const v = voice.lang.toLowerCase().replace(/_/g, "-");
	return v === prefix || v.startsWith(`${prefix}-`);
}

export function pickBestVoiceForLang(
	bcp47: string,
	voices?: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
	if (typeof speechSynthesis === "undefined" && !voices) return null;
	const list = (voices ?? speechSynthesis.getVoices()).filter((v) =>
		voiceMatchesWiki(v, bcp47)
	);
	if (!list.length) return null;
	list.sort((a, b) => {
		const aLocal = a.localService ? 0 : 1;
		const bLocal = b.localService ? 0 : 1;
		if (aLocal !== bLocal) return aLocal - bLocal;
		const aDef = a.default ? 0 : 1;
		const bDef = b.default ? 0 : 1;
		if (aDef !== bDef) return aDef - bDef;
		return (a.name || "").localeCompare(b.name || "");
	});
	return list[0] ?? null;
}

export interface AutoMatchVoiceInput {
	force?: boolean;
	bcp47: string;
	voiceURI: string;
	voiceAutoMatched: boolean;
	voices?: SpeechSynthesisVoice[];
}

export interface AutoMatchVoiceResult {
	voiceURI: string;
	voiceAutoMatched: boolean;
	matched: SpeechSynthesisVoice | null;
	skipped: boolean;
}

/** Auto-pick a matching voice; returns new settings fields (does not mutate). */
export function autoMatchVoiceForLang(input: AutoMatchVoiceInput): AutoMatchVoiceResult {
	const { force = false, bcp47, voiceURI, voiceAutoMatched, voices } = input;
	if (typeof speechSynthesis === "undefined" && !voices) {
		return { voiceURI, voiceAutoMatched, matched: null, skipped: true };
	}
	const list =
		voices ??
		(typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices() : []);
	// Browsers often report [] until voiceschanged — never wipe a saved voiceURI then.
	if (!list.length) {
		return { voiceURI, voiceAutoMatched, matched: null, skipped: true };
	}
	if (!force && voiceAutoMatched === false && voiceURI) {
		return {
			voiceURI,
			voiceAutoMatched,
			matched: pickBestVoiceForLang(bcp47, list),
			skipped: true
		};
	}
	const best = pickBestVoiceForLang(bcp47, list);
	return {
		voiceURI: best ? best.voiceURI : "",
		voiceAutoMatched: true,
		matched: best,
		skipped: false
	};
}

export function getSelectedVoice(
	voiceURI: string | null | undefined,
	voices?: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
	if (!voiceURI) return null;
	if (typeof speechSynthesis === "undefined" && !voices) return null;
	const list = voices ?? speechSynthesis.getVoices();
	return list.find((v) => v.voiceURI === voiceURI) || null;
}

export function applyVoiceSettings(
	utter: SpeechSynthesisUtterance,
	options: {
		voiceURI: string;
		speechRate: number;
		bcp47: string;
		rateMultiplier?: number;
		voices?: SpeechSynthesisVoice[];
	}
): void {
	const voice = getSelectedVoice(options.voiceURI, options.voices);
	if (voice) utter.voice = voice;
	utter.lang = options.bcp47 || "en";
	const base = Number(options.speechRate) || 1;
	const mult = options.rateMultiplier ?? 1;
	utter.rate = Math.min(2, Math.max(0.5, base * mult));
	utter.volume = 1;
}

export function missingVoiceNote(lang: Pick<WikiLang, "label" | "bcp47">): string {
	return `No ${lang.label} voice installed on this device — using the system default with ${lang.bcp47} language tag.`;
}

// —— SpeechController ——

export interface SpeechControllerCallbacks {
	onCaptionIndex: (
		index: number,
		word: HTMLElement | null,
		words: HTMLElement[]
	) => void;
	onEnd?: () => void;
	getRate: () => number;
	getMuted: () => boolean;
	getVoiceURI: () => string;
	getSpeechRate: () => number;
	getLangInfo: () => LangInfoLike;
	isSpeechUnlocked?: () => boolean;
	onNeedUnlock?: () => void;
	canLoop?: () => boolean;
	onLoop?: () => void;
	getLinkImageRemainingMs?: () => number;
	getVoices?: () => SpeechSynthesisVoice[];
	roleColors?: Record<string, string>;
	speechData?: SpeechData;
}

export class SpeechController {
	captionIndex = 0;
	private captionWords: HTMLElement[] = [];
	private paused = false;
	private currentUtterance: SpeechSynthesisUtterance | null = null;
	private usingBoundarySync = false;
	private captionTimer: ReturnType<typeof setTimeout> | null = null;
	private shortLoopTimer: ReturnType<typeof setTimeout> | null = null;
	private speechKeepAlive: ReturnType<typeof setInterval> | null = null;
	private lastFallbackText = "";
	private timedOnly = false;

	constructor(private readonly cb: SpeechControllerCallbacks) {}

	getCaptionWords(): HTMLElement[] {
		return this.captionWords;
	}

	isPaused(): boolean {
		return this.paused;
	}

	stopCaptionTimer(): void {
		if (this.captionTimer) {
			clearTimeout(this.captionTimer);
			this.captionTimer = null;
		}
	}

	private stopSpeechKeepAlive(): void {
		if (this.speechKeepAlive) {
			clearInterval(this.speechKeepAlive);
			this.speechKeepAlive = null;
		}
	}

	/** iOS often pauses synthesis mid-utterance; nudge it awake while speaking. */
	private startSpeechKeepAlive(): void {
		this.stopSpeechKeepAlive();
		if (!this.timedOnly || typeof speechSynthesis === "undefined") return;
		this.speechKeepAlive = setInterval(() => {
			try {
				if (speechSynthesis.speaking) speechSynthesis.resume();
			} catch {
				/* ignore */
			}
		}, 4000);
	}

	stopPlayback(): void {
		this.stopCaptionTimer();
		this.stopSpeechKeepAlive();
		if (this.shortLoopTimer) {
			clearTimeout(this.shortLoopTimer);
			this.shortLoopTimer = null;
		}
		// Cleared first so the cancelled utterance's onend/onerror handlers no-op.
		this.currentUtterance = null;
		this.usingBoundarySync = false;
		if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
	}

	private resetCaptionStyles(words: HTMLElement[]): void {
		words.forEach((w) => {
			w.classList.remove("active", "spoken");
			w.style.removeProperty("--cap-color");
		});
	}

	private roleColors(): Record<string, string> {
		return this.cb.roleColors || this.cb.speechData?.capRoleColors || {};
	}

	highlightCaptionWord(index: number): void {
		const words = this.captionWords;
		if (!words.length) return;
		const i = Math.max(0, Math.min(index, words.length - 1));
		const colors = this.roleColors();
		words.forEach((w, idx) => {
			w.classList.toggle("spoken", idx < i);
			w.classList.toggle("active", idx === i);
			if (idx === i) {
				const role = w.dataset.capRole || "other";
				w.style.setProperty("--cap-color", colors[role] || colors.other || "");
			}
		});
		this.captionIndex = i;
		this.cb.onCaptionIndex(i, words[i] ?? null, words);
	}

	startTimedCaptions(words: HTMLElement[], rate: number, fromIndex = 0): void {
		this.stopCaptionTimer();
		if (!words.length) return;
		this.captionWords = words;
		const speechRate = this.cb.getSpeechRate?.() || 1;
		const mobile = this.timedOnly || prefersTimedCaptionSync();
		let i = Math.max(0, Math.min(fromIndex, words.length - 1));
		this.highlightCaptionWord(i);
		const step = () => {
			// Boundary sync took over — stop the clock.
			if (this.usingBoundarySync) {
				this.stopCaptionTimer();
				return;
			}
			i++;
			if (i >= words.length) {
				this.stopCaptionTimer();
				this.highlightCaptionWord(words.length - 1);
				// Muted / no-TTS path has no utterance.onend, so loop from here.
				if (
					this.cb.getMuted() ||
					this.cb.isSpeechUnlocked?.() === false ||
					typeof speechSynthesis === "undefined"
				)
					this.scheduleShortLoop();
				return;
			}
			this.highlightCaptionWord(i);
			this.captionTimer = setTimeout(
				step,
				captionStepMs(words[i]!, rate, speechRate, { mobile })
			);
		};
		this.captionTimer = setTimeout(
			step,
			captionStepMs(words[i]!, rate, speechRate, { mobile })
		);
	}

	scheduleShortLoop(delayMs = 400): void {
		if (this.shortLoopTimer) {
			clearTimeout(this.shortLoopTimer);
			this.shortLoopTimer = null;
		}
		const linkHold = this.cb.getLinkImageRemainingMs?.() || 0;
		const delay = Math.max(delayMs, linkHold ? linkHold + 250 : 0);
		this.shortLoopTimer = setTimeout(() => {
			this.shortLoopTimer = null;
			if (this.cb.canLoop?.() === false) return;
			if (this.cb.onLoop) this.cb.onLoop();
			else this.cb.onEnd?.();
		}, delay);
	}

	/**
	 * Speaks from a caption word index so pause/resume and speed changes can restart cleanly.
	 */
	speakFrom(words: HTMLElement[], fallbackText: string, startIndex: number): void {
		// Starting speech always means "playing" — pause() leaves this true, and
		// resume used to call speakFrom without clearing it, so the next pause()
		// early-returned and audio kept going.
		this.paused = false;
		this.captionWords = words;
		this.lastFallbackText = fallbackText;
		const baseIndex = words.length
			? Math.max(0, Math.min(startIndex, words.length - 1))
			: 0;
		this.stopPlayback();
		this.resetCaptionStyles(words);
		this.highlightCaptionWord(baseIndex);

		const rate = this.cb.getRate();
		if (this.cb.getMuted() || typeof speechSynthesis === "undefined") {
			this.startTimedCaptions(words, rate, baseIndex);
			return;
		}
		if (this.cb.isSpeechUnlocked && !this.cb.isSpeechUnlocked()) {
			this.cb.onNeedUnlock?.();
			this.startTimedCaptions(words, rate, baseIndex);
			return;
		}

		const spoken = words.slice(baseIndex).map((w) => {
			if (w.dataset.speak != null) return w.dataset.speak;
			return w.textContent || "";
		});
		const data = this.cb.speechData;
		const lang = this.cb.getLangInfo();
		const text =
			spoken.join("").trim() ||
			(data
				? toSpeechText(fallbackText, data, lang.code || "simple", lang.bcp47)
				: fallbackText);
		const tokenStarts: number[] = [];
		let cursor = 0;
		for (const raw of spoken) {
			tokenStarts.push(cursor);
			cursor += raw.length;
		}
		const utter = new SpeechSynthesisUtterance(text);
		applyVoiceSettings(utter, {
			voiceURI: this.cb.getVoiceURI(),
			speechRate: this.cb.getSpeechRate(),
			bcp47: lang.bcp47 || "en",
			rateMultiplier: rate === 1 ? 1 : rate,
			voices: this.cb.getVoices?.()
		});
		this.currentUtterance = utter;
		this.usingBoundarySync = false;
		this.timedOnly = prefersTimedCaptionSync();

		utter.onboundary = (ev) => {
			// iOS/iPadOS boundaries are missing or unreliable — stay on timed sync.
			if (this.timedOnly) return;
			if (ev.name && ev.name !== "word") return;
			this.usingBoundarySync = true;
			this.stopCaptionTimer();
			const offset = tokenStarts.length
				? tokenIndexAtChar(tokenStarts, ev.charIndex || 0)
				: 0;
			this.highlightCaptionWord(baseIndex + offset);
		};
		utter.onend = () => {
			if (this.currentUtterance !== utter) return;
			this.currentUtterance = null;
			this.stopCaptionTimer();
			this.stopSpeechKeepAlive();
			if (words.length) this.highlightCaptionWord(words.length - 1);
			this.scheduleShortLoop();
			this.cb.onEnd?.();
		};
		utter.onerror = () => {
			if (this.currentUtterance !== utter) return;
			this.currentUtterance = null;
			this.stopSpeechKeepAlive();
			if (!this.usingBoundarySync) this.startTimedCaptions(words, rate, baseIndex);
		};

		speechSynthesis.speak(utter);
		this.startSpeechKeepAlive();
		// Drive karaoke from spoken-form timing immediately. Desktop can switch to
		// boundary sync when word events arrive; mobile stays on this clock.
		this.startTimedCaptions(words, rate, baseIndex);
	}

	/** speechSynthesis.pause() is unreliable — cancel and remember the word. */
	pause(): void {
		if (this.paused) return;
		this.paused = true;
		this.stopCaptionTimer();
		this.stopPlayback();
	}

	resume(words?: HTMLElement[], fallbackText?: string): void {
		this.paused = false;
		const w = words ?? this.captionWords;
		const text = fallbackText ?? this.lastFallbackText;
		if (!w.length) return;
		if (
			this.cb.isSpeechUnlocked &&
			!this.cb.isSpeechUnlocked() &&
			!this.cb.getMuted()
		) {
			this.cb.onNeedUnlock?.();
			return;
		}
		this.speakFrom(w, text, this.captionIndex);
	}

	previewSeek(words: HTMLElement[], index: number): number {
		if (!words.length) return 0;
		const i = Math.max(0, Math.min(index, words.length - 1));
		this.stopPlayback();
		this.captionWords = words;
		this.resetCaptionStyles(words);
		this.highlightCaptionWord(i);
		return i;
	}

	seek(
		words: HTMLElement[],
		fallbackText: string,
		index: number,
		{ resume = true }: { resume?: boolean } = {}
	): number {
		const i = this.previewSeek(words, index);
		this.captionIndex = i;
		this.lastFallbackText = fallbackText;
		if (!resume) {
			this.paused = true;
			return i;
		}
		this.paused = false;
		if (
			this.cb.isSpeechUnlocked &&
			!this.cb.isSpeechUnlocked() &&
			!this.cb.getMuted()
		) {
			this.cb.onNeedUnlock?.();
			this.startTimedCaptions(this.captionWords, this.cb.getRate(), i);
			return i;
		}
		this.speakFrom(words, fallbackText, i);
		return i;
	}

	/** Restart speech/captions from the current index (e.g. after mute toggle). */
	restartFromCurrent(words?: HTMLElement[], fallbackText?: string): void {
		if (this.paused) return;
		const w = words ?? this.captionWords;
		const text = fallbackText ?? this.lastFallbackText;
		if (!w.length) return;
		this.speakFrom(w, text, this.captionIndex);
	}
}

/** Factory alias for SpeechController. */
export function createSpeechController(
	callbacks: SpeechControllerCallbacks
): SpeechController {
	return new SpeechController(callbacks);
}
