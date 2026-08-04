import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { PostCard } from "../components/PostCard";
import { useApp } from "../context/AppContext";
import { useSpeechPlayback } from "../hooks/useSpeechPlayback";
import { commonsThumbUrl, normalizeFileTitle } from "../lib/media";
import { BASE_PATH } from "../lib/path";
import {
	FEED_DOCUMENT_TITLE,
	postDocumentTitle,
	postPathForRoute,
	titleToSlug
} from "../lib/routes";
import { syncDocumentMeta } from "../lib/site";

export function ForYouPage() {
	const app = useApp();
	const location = useLocation();
	const rootRef = useRef<HTMLDivElement>(null);
	const postEls = useRef(new Map<number, HTMLElement>());
	const [elVersion, setElVersion] = useState(0);
	const activePost = app.posts.find((p) => p.id === app.activePostId) || null;
	const activeEl =
		(app.activePostId != null ? postEls.current.get(app.activePostId) : null) || null;

	const speechApiRef = useRef<{ speakFrom: (i?: number) => void } | null>(null);
	const speech = useSpeechPlayback({
		post: activePost,
		postEl: activeEl,
		enabled: !!activePost && app.onboardingDone,
		onLoop: () => {
			speechApiRef.current?.speakFrom(0);
		}
	});
	speechApiRef.current = speech;

	const [prefetchSettled, setPrefetchSettled] = useState(false);

	useEffect(() => {
		if (!app.ready || !app.onboardingDone) return;
		let cancelled = false;
		setPrefetchSettled(false);
		void app.ensurePrefetch().finally(() => {
			if (!cancelled) setPrefetchSettled(true);
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- prefetch when ready/onboarding flips
	}, [app.ready, app.onboardingDone, app.ensurePrefetch]);

	useEffect(() => {
		if (!activePost) {
			syncDocumentMeta({
				title: FEED_DOCUMENT_TITLE,
				path: location.pathname
			});
			return;
		}
		const path = postPathForRoute(
			{
				lang: activePost.wikiLang || app.settings.wikiLang,
				slug: titleToSlug(activePost.title)
			},
			app.appData?.wikiLanguages || [],
			app.settings.wikiLang,
			BASE_PATH
		);
		const thumbFile = normalizeFileTitle(activePost.thumb || activePost.images?.[0]);
		const previewImage = thumbFile ? commonsThumbUrl(thumbFile, 1200) : null;
		syncDocumentMeta({
			title: postDocumentTitle(activePost.title),
			description: activePost.text?.slice(0, 200) || undefined,
			path,
			image: previewImage
		});
		const cur = location.pathname.replace(/\/+$/, "");
		const next = path.replace(/\/+$/, "");
		if (cur !== next) {
			try {
				history.replaceState(
					{
						postSlug: titleToSlug(activePost.title),
						postLang: activePost.wikiLang || app.settings.wikiLang
					},
					"",
					path
				);
			} catch {
				/* ignore */
			}
		}
	}, [
		activePost,
		app.appData?.wikiLanguages,
		app.settings.wikiLang,
		location.pathname
	]);

	const onActivate = useCallback(
		(postId: number) => {
			if (app.activePostId === postId) return;
			app.setActivePostId(postId);
			app.setPaused(false);
			app.setRate(1);
			app.setCaptionIndex(0);
			void app.ensurePrefetch();
			setTimeout(app.save, 100);
		},
		[app]
	);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLElement &&
				(e.target.tagName === "INPUT" ||
					e.target.tagName === "TEXTAREA" ||
					e.target.tagName === "SELECT" ||
					e.target.isContentEditable)
			)
				return;
			if (!app.activePostId) return;
			const posts = app.posts;
			const idx = posts.findIndex((p) => p.id === app.activePostId);
			if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") {
				e.preventDefault();
				const next = posts[idx + 1];
				if (next) {
					postEls.current
						.get(next.id)
						?.scrollIntoView({ behavior: "smooth", block: "start" });
				} else {
					void app.ensurePrefetch().then(() => {
						const newer = app.posts[idx + 1];
						if (newer)
							postEls.current
								.get(newer.id)
								?.scrollIntoView({ behavior: "smooth", block: "start" });
					});
				}
			} else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
				e.preventDefault();
				const prev = posts[idx - 1];
				if (prev)
					postEls.current
						.get(prev.id)
						?.scrollIntoView({ behavior: "smooth", block: "start" });
			} else if (e.key === " " || e.code === "Space") {
				e.preventDefault();
				app.togglePause();
			} else if (e.key === "m") {
				app.setMuted(!app.settings.muted);
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [app]);

	useEffect(() => {
		if (app.posts.length && app.activePostId == null) {
			onActivate(app.posts[0]!.id);
		}
	}, [app.posts, app.activePostId, onActivate]);

	const registerEl = useCallback((postId: number, el: HTMLElement | null) => {
		const prev = postEls.current.get(postId) ?? null;
		if (el === prev) return;
		if (el) postEls.current.set(postId, el);
		else postEls.current.delete(postId);
		setElVersion((v) => v + 1);
	}, []);

	// Keep activeEl lookup fresh after registerEl updates the map.
	void elVersion;

	// When search / deep-link / related jumps to a post, snap it into the viewport
	// so it overrides the current card instead of sitting one swipe away.
	useEffect(() => {
		if (app.activePostId == null) return;
		const el = postEls.current.get(app.activePostId);
		if (!el) return;
		el.scrollIntoView({ behavior: "auto", block: "start" });
	}, [app.activePostId, elVersion]);

	if (prefetchSettled && app.posts.length === 0) {
		return (
			<div className="feedEmpty" id="shortsFeed" role="status">
				<p>Couldn&apos;t load shorts right now.</p>
				<button
					type="button"
					onClick={() => {
						setPrefetchSettled(false);
						void app.ensurePrefetch().finally(() => setPrefetchSettled(true));
					}}
				>
					Retry
				</button>
			</div>
		);
	}

	return (
		<div className="posts" id="shortsFeed" ref={rootRef}>
			{app.posts.map((post) => (
				<PostCard
					key={post.id}
					post={post}
					active={post.id === app.activePostId}
					onActivate={onActivate}
					captionIndex={post.id === app.activePostId ? app.captionIndex : 0}
					speechApi={post.id === app.activePostId ? speech : null}
					registerEl={registerEl}
				/>
			))}
		</div>
	);
}
