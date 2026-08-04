import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
	type ReactNode
} from "react";
import { APP_VERSION, loadAppData, PREFETCH_AHEAD, type AppData } from "../lib/config";
import {
	addProfile as addProfileLib,
	applyLangSlice,
	captionCssVars,
	clearAllPersistedData,
	clearProfileData,
	defaultLangSlice,
	defaultSettings,
	deleteProfile as deleteProfileLib,
	getWikiLangInfo,
	initProfile,
	loadProfile,
	loadSettings,
	persistLangSlice,
	readProfileDisplayName,
	saveProfile,
	saveSettings,
	themeIsLight,
	type AppliedLangSlice
} from "../lib/profile";
import { autoMatchVoiceForLang, missingVoiceNote } from "../lib/speech";
import {
	clearLiveCaches,
	engagePost,
	fetchSectionPlaintext,
	fetchTopLevelSections,
	getNextPost,
	getPageByTitle,
	getSpokenSectionTitle,
	getSpokenText,
	hydrateByTitles,
	prefetchRelatedForSection,
	shareArticle,
	type EngagementDeps,
	type WikiFeedDeps
} from "../lib/wiki";
import type {
	ArticleSection,
	Post,
	ProfileStore,
	SectionPlayback,
	Settings
} from "../types/wiki";

export type DescState = {
	post: Post;
	related: Array<{ id: number; title: string; page: Post }>;
	sections: ArticleSection[];
	sectionsLoading: boolean;
	sectionError: string | null;
} | null;

export type EngagementState = {
	categoryScores: Record<string, number>;
	seenPosts: number[];
	likedPosts: number[];
	dislikedPosts: number[];
	timeSpentTotal: number;
	timeSpentSession: number;
	lastSpentTime: number;
	postsWithoutLike: number;
	likesLen: number;
};

export type AppContextValue = {
	appData: AppData | null;
	ready: boolean;
	loadFailed: boolean;
	loadingText: string;
	retryBootstrap: () => void;
	settings: Settings;
	engagement: EngagementState;
	profileName: string;
	profileStore: ProfileStore;
	posts: Post[];
	activePostId: number | null;
	speechUnlocked: boolean;
	playbackPaused: boolean;
	playbackRate: number;
	captionIndex: number;
	onboardingDone: boolean;
	showTapToPlay: boolean;
	voices: SpeechSynthesisVoice[];
	desc: DescState;
	sectionPlayback: SectionPlayback | null;
	candidateQueue: Post[];
	APP_VERSION: string;
	getSpokenText: (post: Post) => string;
	getSpokenSectionTitle: (post: Post) => string;
	updateSettings: (patch: Partial<Settings>) => void;
	save: () => void;
	likePost: (post: Post) => void;
	dislikePost: (post: Post) => void;
	isLiked: (postId: number) => boolean;
	isDisliked: (postId: number) => boolean;
	setMuted: (muted: boolean) => void;
	setPaused: (paused: boolean) => void;
	togglePause: () => void;
	setRate: (rate: number) => void;
	setCaptionIndex: (index: number) => void;
	setActivePostId: (id: number | null) => void;
	changeWikiLang: (lang: string, opts?: { restartFeed?: boolean }) => Promise<void>;
	resetAlgorithm: () => void;
	resetEverything: () => void;
	addProfile: (name: string) => void;
	switchProfile: (profileId: string) => Promise<void>;
	deleteProfile: (profileId: string) => void;
	ensurePrefetch: () => Promise<void>;
	appendPost: (post: Post) => void;
	insertPostAfter: (afterId: number | null, post: Post) => void;
	openPostByTitle: (title: string, lang?: string | null) => Promise<Post | null>;
	unlockSpeech: () => void;
	setShowTapToPlay: (show: boolean) => void;
	completeOnboarding: (picked: string[]) => Promise<void>;
	openDescription: (post: Post) => void;
	closeDescription: () => void;
	selectSection: (
		post: Post,
		section: ArticleSection | { index: 0; title: string }
	) => Promise<void>;
	clearSectionError: () => void;
	sharePost: (post: Post) => Promise<"shared" | "copied" | "aborted" | "failed">;
	getFeedDeps: () => WikiFeedDeps;
	syncThemeColor: () => void;
	previewVoice: () => void;
	voiceNote: string;
};

const AppContext = createContext<AppContextValue | null>(null);

function emptyEngagement(): EngagementState {
	const slice = defaultLangSlice();
	return {
		categoryScores: { ...slice.categoryScores },
		seenPosts: [],
		likedPosts: [],
		dislikedPosts: [],
		timeSpentTotal: 0,
		timeSpentSession: 0,
		lastSpentTime: Date.now(),
		postsWithoutLike: 0,
		likesLen: 0
	};
}

function applySliceToEngagement(
	slice: AppliedLangSlice,
	timeSpentTotal: number,
	prev?: EngagementState
): EngagementState {
	return {
		categoryScores: { ...slice.categoryScores },
		seenPosts: [...slice.seenPosts],
		likedPosts: [...slice.likedPosts],
		dislikedPosts: [...slice.dislikedPosts],
		timeSpentTotal,
		timeSpentSession: prev?.timeSpentSession ?? 0,
		lastSpentTime: Date.now(),
		postsWithoutLike: prev?.postsWithoutLike ?? 0,
		likesLen: slice.likesLen
	};
}

function applyCaptionVars(settings: Settings): void {
	const vars = captionCssVars(settings);
	document.documentElement.style.setProperty("--caption-size", vars.captionSize);
	document.documentElement.style.setProperty("--caption-stroke", vars.captionStroke);
}

export function AppProvider({ children }: { children: ReactNode }) {
	const [appData, setAppData] = useState<AppData | null>(null);
	const [ready, setReady] = useState(false);
	const [loadFailed, setLoadFailed] = useState(false);
	const [loadingText, setLoadingText] = useState("loading config…");
	const [settings, setSettings] = useState<Settings>(defaultSettings);
	const [engagement, setEngagement] = useState<EngagementState>(emptyEngagement);
	const [profileName, setProfileName] = useState("Default");
	const [profileStore, setProfileStore] = useState<ProfileStore>({
		profileName: "Default",
		timeSpentTotal: 0,
		byLang: {}
	});
	const [posts, setPosts] = useState<Post[]>([]);
	const [activePostId, setActivePostId] = useState<number | null>(null);
	const [speechUnlocked, setSpeechUnlocked] = useState(false);
	const [playbackPaused, setPlaybackPaused] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [captionIndex, setCaptionIndex] = useState(0);
	const [onboardingDone, setOnboardingDone] = useState(false);
	const [showTapToPlay, setShowTapToPlay] = useState(false);
	const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
	const [desc, setDesc] = useState<DescState>(null);
	const [sectionPlayback, setSectionPlayback] = useState<SectionPlayback | null>(null);
	const [candidateQueue, setCandidateQueue] = useState<Post[]>([]);
	const [voiceNote, setVoiceNote] = useState("");
	const sectionSelectGen = useRef(0);

	const settingsRef = useRef(settings);
	const engagementRef = useRef(engagement);
	const postsRef = useRef(posts);
	const candidateQueueRef = useRef(candidateQueue);
	const appDataRef = useRef(appData);
	const profileStoreRef = useRef(profileStore);
	const profileNameRef = useRef(profileName);
	const prefetchBusy = useRef(false);
	const speechUnlockedRef = useRef(speechUnlocked);

	useEffect(() => {
		settingsRef.current = settings;
	}, [settings]);
	useEffect(() => {
		engagementRef.current = engagement;
	}, [engagement]);
	useEffect(() => {
		postsRef.current = posts;
	}, [posts]);
	useEffect(() => {
		candidateQueueRef.current = candidateQueue;
	}, [candidateQueue]);
	useEffect(() => {
		appDataRef.current = appData;
	}, [appData]);
	useEffect(() => {
		profileStoreRef.current = profileStore;
	}, [profileStore]);
	useEffect(() => {
		profileNameRef.current = profileName;
	}, [profileName]);
	useEffect(() => {
		speechUnlockedRef.current = speechUnlocked;
	}, [speechUnlocked]);

	const syncThemeColor = useCallback(() => {
		const meta = document.querySelector('meta[name="theme-color"]');
		if (!meta) return;
		const page = document.body.dataset.page || "foryou";
		const onboarding = document.body.dataset.onboarding === "1";
		const feedDark = !onboarding && page === "foryou";
		const light = themeIsLight(
			settingsRef.current.theme,
			window.matchMedia("(prefers-color-scheme: light)").matches
		);
		meta.setAttribute("content", feedDark || !light ? "#000000" : "#f5f5f5");
	}, []);

	const updateVoiceNote = useCallback((s: Settings, list: SpeechSynthesisVoice[]) => {
		const data = appDataRef.current;
		if (!data) return;
		const info = getWikiLangInfo(data.wikiLanguages, s.wikiLang);
		if (!info) return;
		const match = list.some(
			(v) =>
				v.lang &&
				(v.lang.toLowerCase().replace(/_/g, "-") === info.bcp47.toLowerCase() ||
					v.lang
						.toLowerCase()
						.replace(/_/g, "-")
						.startsWith(`${info.bcp47.toLowerCase()}-`))
		);
		setVoiceNote(match ? "" : missingVoiceNote(info));
	}, []);

	const getFeedDeps = useCallback((): WikiFeedDeps => {
		return {
			getVisiblePostIds: () => postsRef.current.map((p) => p.id),
			getSettings: () => settingsRef.current,
			getCandidateQueue: () => candidateQueueRef.current,
			getEngagement: (): EngagementDeps => engagementRef.current,
			getTopicNoiseRe: () => appDataRef.current?.topicNoiseRe || []
		};
	}, []);

	const save = useCallback(() => {
		const s = settingsRef.current;
		saveSettings(s);
		if (!s.storeData) return;
		const eng = engagementRef.current;
		const nextStore = persistLangSlice(
			{ ...profileStoreRef.current, byLang: { ...profileStoreRef.current.byLang } },
			s.wikiLang || "simple",
			{
				categoryScores: eng.categoryScores,
				seenPosts: eng.seenPosts,
				likedPosts: eng.likedPosts,
				dislikedPosts: eng.dislikedPosts
			},
			profileNameRef.current,
			eng.timeSpentTotal
		);
		profileStoreRef.current = nextStore;
		setProfileStore(nextStore);
		saveProfile(s.profile, nextStore, s.storeData);
	}, []);

	const updateSettings = useCallback(
		(patch: Partial<Settings>) => {
			setSettings((prev) => {
				const next = { ...prev, ...patch };
				settingsRef.current = next;
				applyCaptionVars(next);
				saveSettings(next);
				queueMicrotask(() => syncThemeColor());
				return next;
			});
		},
		[syncThemeColor]
	);

	const likePost = useCallback(
		(post: Post) => {
			setEngagement((prev) => {
				const liked = prev.likedPosts.includes(post.id);
				const categoryScores = { ...prev.categoryScores };
				let likedPosts = [...prev.likedPosts];
				let dislikedPosts = [...prev.dislikedPosts];
				const noise = appDataRef.current?.topicNoiseRe || [];
				if (liked) {
					likedPosts = likedPosts.filter((id) => id !== post.id);
					engagePost(
						post,
						-(50 + prev.postsWithoutLike * 4),
						categoryScores,
						noise
					);
				} else {
					dislikedPosts = dislikedPosts.filter((id) => id !== post.id);
					if (!likedPosts.includes(post.id)) likedPosts.push(post.id);
					engagePost(
						post,
						50 + prev.postsWithoutLike * 4,
						categoryScores,
						noise
					);
				}
				const next = {
					...prev,
					categoryScores,
					likedPosts,
					dislikedPosts,
					postsWithoutLike: 0
				};
				engagementRef.current = next;
				setTimeout(save, 100);
				return next;
			});
		},
		[save]
	);

	const dislikePost = useCallback(
		(post: Post) => {
			setEngagement((prev) => {
				const disliked = prev.dislikedPosts.includes(post.id);
				const categoryScores = { ...prev.categoryScores };
				let likedPosts = [...prev.likedPosts];
				let dislikedPosts = [...prev.dislikedPosts];
				const noise = appDataRef.current?.topicNoiseRe || [];
				if (disliked) {
					dislikedPosts = dislikedPosts.filter((id) => id !== post.id);
					engagePost(
						post,
						50 + prev.postsWithoutLike * 4,
						categoryScores,
						noise
					);
				} else {
					likedPosts = likedPosts.filter((id) => id !== post.id);
					if (!dislikedPosts.includes(post.id)) dislikedPosts.push(post.id);
					engagePost(
						post,
						-(50 + prev.postsWithoutLike * 4),
						categoryScores,
						noise
					);
				}
				const next = {
					...prev,
					categoryScores,
					likedPosts,
					dislikedPosts,
					postsWithoutLike: 0
				};
				engagementRef.current = next;
				setTimeout(save, 100);
				return next;
			});
		},
		[save]
	);

	const isLiked = useCallback(
		(postId: number) => engagement.likedPosts.includes(postId),
		[engagement.likedPosts]
	);
	const isDisliked = useCallback(
		(postId: number) => engagement.dislikedPosts.includes(postId),
		[engagement.dislikedPosts]
	);

	const setMuted = useCallback(
		(muted: boolean) => {
			updateSettings({ muted });
		},
		[updateSettings]
	);

	const setPaused = useCallback((paused: boolean) => {
		setPlaybackPaused(paused);
	}, []);

	const togglePause = useCallback(() => {
		setPlaybackPaused((p) => !p);
	}, []);

	const setRate = useCallback((rate: number) => {
		setPlaybackRate(rate);
	}, []);

	const appendPost = useCallback((post: Post) => {
		setPosts((prev) => {
			if (prev.some((p) => p.id === post.id)) return prev;
			const next = [...prev, post];
			postsRef.current = next;
			return next;
		});
	}, []);

	const insertPostAfter = useCallback((afterId: number | null, post: Post) => {
		setPosts((prev) => {
			if (prev.some((p) => p.id === post.id)) return prev;
			if (afterId == null) {
				const next = [post, ...prev];
				postsRef.current = next;
				return next;
			}
			const idx = prev.findIndex((p) => p.id === afterId);
			if (idx < 0) {
				const next = [...prev, post];
				postsRef.current = next;
				return next;
			}
			const next = [...prev.slice(0, idx + 1), post, ...prev.slice(idx + 1)];
			postsRef.current = next;
			return next;
		});
	}, []);

	const ensurePrefetch = useCallback(async () => {
		if (!ready || prefetchBusy.current) return;
		prefetchBusy.current = true;
		try {
			while (postsRef.current.length < PREFETCH_AHEAD) {
				const post = await getNextPost(getFeedDeps());
				if (!post) break;
				setEngagement((e) => {
					const next = { ...e, ...engagementRef.current };
					engagementRef.current = next;
					return { ...engagementRef.current };
				});
				appendPost(post);
			}
			const activeId = activePostId;
			if (activeId != null) {
				let postsNow = postsRef.current;
				let idx = postsNow.findIndex((p) => p.id === activeId);
				while (idx >= 0 && postsNow.length - idx - 1 < PREFETCH_AHEAD) {
					const post = await getNextPost(getFeedDeps());
					if (!post) break;
					appendPost(post);
					postsNow = postsRef.current;
					idx = postsNow.findIndex((p) => p.id === activeId);
				}
			}
			setEngagement((e) => ({
				...engagementRef.current,
				timeSpentSession: e.timeSpentSession
			}));
			setTimeout(save, 100);
		} finally {
			prefetchBusy.current = false;
		}
	}, [ready, activePostId, appendPost, getFeedDeps, save]);

	const restartFeed = useCallback(async () => {
		setPosts([]);
		postsRef.current = [];
		setActivePostId(null);
		setCandidateQueue([]);
		candidateQueueRef.current = [];
		clearLiveCaches();
		await ensurePrefetch();
	}, [ensurePrefetch]);

	const changeWikiLang = useCallback(
		async (lang: string, opts: { restartFeed?: boolean } = {}) => {
			const data = appDataRef.current;
			if (!data) return;
			const next = data.wikiLanguages.some((l) => l.code === lang)
				? lang
				: "simple";
			if (next === settingsRef.current.wikiLang) return;

			save();
			const s = {
				...settingsRef.current,
				wikiLang: next,
				voiceAutoMatched: true
			};
			settingsRef.current = s;
			setSettings(s);
			saveSettings(s);

			const slice = applyLangSlice(profileStoreRef.current, next, undefined);
			const eng = applySliceToEngagement(
				slice,
				engagementRef.current.timeSpentTotal,
				engagementRef.current
			);
			engagementRef.current = eng;
			setEngagement(eng);

			clearLiveCaches(candidateQueueRef.current);
			setCandidateQueue([]);
			candidateQueueRef.current = [];
			setPosts([]);
			postsRef.current = [];
			setActivePostId(null);

			const matched = autoMatchVoiceForLang({
				force: true,
				bcp47: getWikiLangInfo(data.wikiLanguages, next)?.bcp47 || "en",
				voiceURI: s.voiceURI,
				voiceAutoMatched: true,
				voices: voices
			});
			if (!matched.skipped) {
				updateSettings({
					voiceURI: matched.voiceURI,
					voiceAutoMatched: matched.voiceAutoMatched
				});
			}
			updateVoiceNote({ ...s, voiceURI: matched.voiceURI }, voices);

			if (opts.restartFeed !== false) await restartFeed();
		},
		[save, restartFeed, updateSettings, updateVoiceNote, voices]
	);

	const resetAlgorithm = useCallback(() => {
		if (
			!confirm(
				`Reset recommendations and stats for profile "${profileNameRef.current}"?`
			)
		)
			return;
		clearProfileData(settingsRef.current.profile);
		document.location.reload();
	}, []);

	const resetEverything = useCallback(() => {
		if (!confirm("Are you sure you want to reset all data and settings?")) return;
		clearAllPersistedData(settingsRef.current);
		document.location.reload();
	}, []);

	const addProfile = useCallback((name: string) => {
		const { profileId, settings: next } = addProfileLib(name, settingsRef.current);
		settingsRef.current = next;
		setSettings(next);
		saveSettings(next);
		const loaded = loadProfile(profileId, next);
		setProfileStore(loaded.profileStore);
		profileStoreRef.current = loaded.profileStore;
		setProfileName(loaded.profileName);
		setEngagement(applySliceToEngagement(loaded.slice, loaded.timeSpentTotal));
		document.location.reload();
	}, []);

	const switchProfile = useCallback(
		async (profileId: string) => {
			const loaded = loadProfile(profileId, settingsRef.current);
			settingsRef.current = loaded.settings;
			setSettings(loaded.settings);
			setProfileStore(loaded.profileStore);
			profileStoreRef.current = loaded.profileStore;
			setProfileName(loaded.profileName);
			const eng = applySliceToEngagement(loaded.slice, loaded.timeSpentTotal);
			engagementRef.current = eng;
			setEngagement(eng);
			await restartFeed();
		},
		[restartFeed]
	);

	const deleteProfileFn = useCallback((profileId: string) => {
		const display = readProfileDisplayName(profileId);
		if (!confirm(`Delete profile ${display}?`)) return;
		const next = deleteProfileLib(profileId, settingsRef.current);
		settingsRef.current = next;
		setSettings(next);
		saveSettings(next);
		if (
			profileId === settingsRef.current.profile ||
			!next.profiles.includes(settingsRef.current.profile)
		) {
			const loaded = initProfile(next);
			if (loaded) {
				setSettings(loaded.settings);
				settingsRef.current = loaded.settings;
				setProfileStore(loaded.profileStore);
				setProfileName(loaded.profileName);
				setEngagement(
					applySliceToEngagement(loaded.slice, loaded.timeSpentTotal)
				);
			}
		}
	}, []);

	const openPostByTitle = useCallback(
		async (title: string, lang?: string | null): Promise<Post | null> => {
			const clean = String(title || "").trim();
			if (!clean) return null;
			if (lang) await changeWikiLang(lang, { restartFeed: false });
			let post = getPageByTitle(clean);
			if (!post?.text || post.text.length < 20) {
				const hydrated = await hydrateByTitles(
					[clean],
					settingsRef.current,
					appDataRef.current?.topicNoiseRe || []
				);
				post = hydrated[0] || post;
			}
			if (!post?.text) return null;
			post.wikiLang = settingsRef.current.wikiLang || "simple";
			const activeId = activePostId;
			// Place at the active index so it overrides the current card instead of
			// queuing as the next swipe. Previous post shifts down one slot.
			setPosts((prev) => {
				const without = prev.filter((p) => p.id !== post!.id);
				const idx =
					activeId == null ? -1 : without.findIndex((p) => p.id === activeId);
				const next =
					idx < 0
						? [post!, ...without]
						: [...without.slice(0, idx), post!, ...without.slice(idx)];
				postsRef.current = next;
				return next;
			});
			setActivePostId(post.id);
			setCaptionIndex(0);
			setSectionPlayback(null);
			setPlaybackPaused(false);
			setPlaybackRate(1);
			void ensurePrefetch();
			return post;
		},
		[changeWikiLang, activePostId, ensurePrefetch]
	);

	const unlockSpeech = useCallback(() => {
		setSpeechUnlocked(true);
		setShowTapToPlay(false);
	}, []);

	const completeOnboarding = useCallback(
		async (picked: string[]) => {
			const defaults = appDataRef.current?.defaultCategories || [];
			setEngagement((prev) => {
				const categoryScores = { ...prev.categoryScores };
				for (const cat of picked) {
					categoryScores[cat] = defaults.includes(cat) ? 1000 : 5000;
				}
				const next = { ...prev, categoryScores };
				engagementRef.current = next;
				return next;
			});
			const custom = picked.filter((c) => !defaults.includes(c));
			if (custom.length) {
				try {
					const pages = await hydrateByTitles(
						custom,
						settingsRef.current,
						appDataRef.current?.topicNoiseRe || []
					);
					setEngagement((prev) => {
						const categoryScores = { ...prev.categoryScores };
						pages.forEach((page) =>
							engagePost(
								page,
								100,
								categoryScores,
								appDataRef.current?.topicNoiseRe || []
							)
						);
						const next = { ...prev, categoryScores };
						engagementRef.current = next;
						return next;
					});
				} catch (err) {
					console.warn("onboarding hydrate failed", err);
				}
			}
			setOnboardingDone(true);
			delete document.body.dataset.onboarding;
			setSpeechUnlocked(true);
			setTimeout(save, 100);
			syncThemeColor();
			await ensurePrefetch();
		},
		[save, syncThemeColor, ensurePrefetch]
	);

	const openDescription = useCallback((post: Post) => {
		const related = (post._relatedInSummary || []).map((r) => ({
			id: r.id,
			title: r.title,
			page: r.page
		}));
		const cached = post._sections;
		setDesc({
			post,
			related,
			sections: cached || [],
			sectionsLoading: !cached,
			sectionError: null
		});
		setPlaybackPaused(true);
		if (!cached) {
			void (async () => {
				const sections = await fetchTopLevelSections(
					post,
					settingsRef.current.wikiLang || "simple"
				);
				setDesc((prev) =>
					prev && prev.post.id === post.id
						? { ...prev, sections, sectionsLoading: false }
						: prev
				);
			})();
		}
	}, []);

	const closeDescription = useCallback(() => {
		setDesc(null);
	}, []);

	const clearSectionError = useCallback(() => {
		setDesc((prev) => (prev ? { ...prev, sectionError: null } : prev));
	}, []);

	const getSpokenTextForPost = useCallback(
		(post: Post) => getSpokenText(post, sectionPlayback),
		[sectionPlayback]
	);

	const getSpokenSectionTitleForPost = useCallback(
		(post: Post) => getSpokenSectionTitle(post, sectionPlayback),
		[sectionPlayback]
	);

	const selectSection = useCallback(
		async (post: Post, section: ArticleSection | { index: 0; title: string }) => {
			const gen = ++sectionSelectGen.current;
			const lang = settingsRef.current.wikiLang || "simple";
			setDesc((prev) => (prev ? { ...prev, sectionError: null } : prev));

			if (section.index === 0) {
				setSectionPlayback({
					postId: post.id,
					sectionIndex: 0,
					sectionTitle: "Summary",
					text: post.text,
					related: post._relatedInSummary
				});
				setCaptionIndex(0);
				setDesc(null);
				setPlaybackPaused(false);
				return;
			}

			try {
				const text = await fetchSectionPlaintext(post, section.index, lang);
				if (gen !== sectionSelectGen.current) return;
				if (!text || text.length < 20) {
					setDesc((prev) =>
						prev && prev.post.id === post.id
							? {
									...prev,
									sectionError: "Couldn't load that section."
								}
							: prev
					);
					return;
				}
				const related = await prefetchRelatedForSection(
					post,
					settingsRef.current,
					section.index,
					text
				);
				if (gen !== sectionSelectGen.current) return;
				setSectionPlayback({
					postId: post.id,
					sectionIndex: section.index,
					sectionTitle: section.title,
					text,
					related
				});
				setCaptionIndex(0);
				setDesc(null);
				setPlaybackPaused(false);
			} catch (err) {
				console.warn("selectSection failed", err);
				if (gen !== sectionSelectGen.current) return;
				setDesc((prev) =>
					prev && prev.post.id === post.id
						? { ...prev, sectionError: "Couldn't load that section." }
						: prev
				);
			}
		},
		[]
	);

	const sharePost = useCallback(async (post: Post) => {
		const data = appDataRef.current;
		if (!data) return "failed" as const;
		return shareArticle(post, data.wikiLanguages, settingsRef.current);
	}, []);

	const previewVoice = useCallback(() => {
		if (typeof speechSynthesis === "undefined") return;
		setSpeechUnlocked(true);
		setShowTapToPlay(false);
		speechSynthesis.cancel();
		const info = getWikiLangInfo(
			appDataRef.current?.wikiLanguages || [],
			settingsRef.current.wikiLang
		);
		const utter = new SpeechSynthesisUtterance(
			info?.preview || "Hello from Tikipedia."
		);
		const voice = voices.find((v) => v.voiceURI === settingsRef.current.voiceURI);
		if (voice) utter.voice = voice;
		utter.lang = info?.bcp47 || "en";
		utter.rate = Number(settingsRef.current.speechRate) || 1;
		speechSynthesis.speak(utter);
	}, [voices]);

	const bootstrap = useEffectEvent(async () => {
		try {
			setLoadFailed(false);
			setLoadingText("loading config…");
			const data = await loadAppData();
			setAppData(data);
			appDataRef.current = data;

			const s = loadSettings(data.wikiLanguages);
			setSettings(s);
			settingsRef.current = s;
			applyCaptionVars(s);

			setLoadingText("loading profile");
			const loaded = initProfile(s);
			let hasSeen = false;
			if (loaded) {
				setSettings(loaded.settings);
				settingsRef.current = loaded.settings;
				setProfileStore(loaded.profileStore);
				profileStoreRef.current = loaded.profileStore;
				setProfileName(loaded.profileName);
				const eng = applySliceToEngagement(loaded.slice, loaded.timeSpentTotal);
				engagementRef.current = eng;
				setEngagement(eng);
				hasSeen = loaded.hasSeenPosts;
			} else {
				const slice = defaultLangSlice();
				const eng = applySliceToEngagement({ ...slice, likesLen: 0 }, 0);
				engagementRef.current = eng;
				setEngagement(eng);
			}

			if (typeof speechSynthesis !== "undefined") {
				const refreshVoices = () => {
					const list = speechSynthesis.getVoices();
					setVoices(list);
					const matched = autoMatchVoiceForLang({
						force: settingsRef.current.voiceAutoMatched !== false,
						bcp47:
							getWikiLangInfo(
								data.wikiLanguages,
								settingsRef.current.wikiLang
							)?.bcp47 || "en",
						voiceURI: settingsRef.current.voiceURI,
						voiceAutoMatched: settingsRef.current.voiceAutoMatched,
						voices: list
					});
					if (!matched.skipped) {
						const next = {
							...settingsRef.current,
							voiceURI: matched.voiceURI,
							voiceAutoMatched: matched.voiceAutoMatched
						};
						settingsRef.current = next;
						setSettings(next);
						saveSettings(next);
					}
					updateVoiceNote(settingsRef.current, list);
				};
				refreshVoices();
				speechSynthesis.addEventListener("voiceschanged", refreshVoices);
			}

			setReady(true);
			if (hasSeen) {
				setOnboardingDone(true);
				delete document.body.dataset.onboarding;
			} else {
				setOnboardingDone(false);
				document.body.dataset.onboarding = "1";
			}
			syncThemeColor();
		} catch (err) {
			console.error("bootstrap failed", err);
			setLoadingText("Couldn't load Tikipedia.");
			setLoadFailed(true);
		}
	});

	const retryBootstrap = useCallback(() => {
		void bootstrap();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- Effect Event is stable
	}, []);

	// Run once on mount. Do not put useEffectEvent results in the dependency array —
	// that re-fires bootstrap after every setState and hits "Maximum update depth".
	useEffect(() => {
		void bootstrap();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
	}, []);

	useEffect(() => {
		applyCaptionVars(settings);
	}, [settings.captionSize, settings.captionStroke, settings]);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: light)");
		const onChange = () => {
			if (settingsRef.current.theme === "theme-auto") syncThemeColor();
		};
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [syncThemeColor]);

	useEffect(() => {
		syncThemeColor();
	}, [settings.theme, syncThemeColor]);

	// Always start a newly activated post on Summary.
	useEffect(() => {
		setSectionPlayback(null);
		sectionSelectGen.current += 1;
	}, [activePostId]);

	const value = useMemo<AppContextValue>(
		() => ({
			appData,
			ready,
			loadFailed,
			loadingText,
			retryBootstrap,
			settings,
			engagement,
			profileName,
			profileStore,
			posts,
			activePostId,
			speechUnlocked,
			playbackPaused,
			playbackRate,
			captionIndex,
			onboardingDone,
			showTapToPlay,
			voices,
			desc,
			sectionPlayback,
			candidateQueue,
			APP_VERSION,
			getSpokenText: getSpokenTextForPost,
			getSpokenSectionTitle: getSpokenSectionTitleForPost,
			updateSettings,
			save,
			likePost,
			dislikePost,
			isLiked,
			isDisliked,
			setMuted,
			setPaused,
			togglePause,
			setRate,
			setCaptionIndex,
			setActivePostId,
			changeWikiLang,
			resetAlgorithm,
			resetEverything,
			addProfile,
			switchProfile,
			deleteProfile: deleteProfileFn,
			ensurePrefetch,
			appendPost,
			insertPostAfter,
			openPostByTitle,
			unlockSpeech,
			setShowTapToPlay,
			completeOnboarding,
			openDescription,
			closeDescription,
			selectSection,
			clearSectionError,
			sharePost,
			getFeedDeps,
			syncThemeColor,
			previewVoice,
			voiceNote
		}),
		[
			appData,
			ready,
			loadFailed,
			loadingText,
			retryBootstrap,
			settings,
			engagement,
			profileName,
			profileStore,
			posts,
			activePostId,
			speechUnlocked,
			playbackPaused,
			playbackRate,
			captionIndex,
			onboardingDone,
			showTapToPlay,
			voices,
			desc,
			sectionPlayback,
			candidateQueue,
			getSpokenTextForPost,
			getSpokenSectionTitleForPost,
			updateSettings,
			save,
			likePost,
			dislikePost,
			isLiked,
			isDisliked,
			setMuted,
			setPaused,
			togglePause,
			setRate,
			changeWikiLang,
			resetAlgorithm,
			resetEverything,
			addProfile,
			switchProfile,
			deleteProfileFn,
			ensurePrefetch,
			appendPost,
			insertPostAfter,
			openPostByTitle,
			unlockSpeech,
			completeOnboarding,
			openDescription,
			closeDescription,
			selectSection,
			clearSectionError,
			sharePost,
			getFeedDeps,
			syncThemeColor,
			previewVoice,
			voiceNote
		]
	);

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
	const ctx = useContext(AppContext);
	if (!ctx) throw new Error("useApp must be used within AppProvider");
	return ctx;
}
