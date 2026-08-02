import {
	useEffect,
	useEffectEvent,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent
} from "react";
import { useApp } from "../context/AppContext";
import { DOUBLE_TAP_MS } from "../lib/config";
import {
	commonsThumbUrl,
	createPostMediaController,
	hydratePostImages,
	normalizeFileTitle
} from "../lib/media";
import { titleToSlug } from "../lib/routes";
import { buildCaptionWords } from "../lib/speech";
import { classifyPostTopic } from "../lib/topics";
import {
	findRelatedInSummary,
	getPageById,
	prefetchRelatedThumbs,
	wikiQuery
} from "../lib/wiki";
import type { Post } from "../types/wiki";
import { Icon } from "./Icon";

type Props = {
	post: Post;
	active: boolean;
	onActivate: (postId: number) => void;
	captionIndex: number;
	speechApi?: {
		seek: (index: number, resume?: boolean) => number;
		previewSeek: (index: number) => number;
	} | null;
	registerEl?: (postId: number, el: HTMLElement | null) => void;
};

export function PostCard({
	post,
	active,
	onActivate,
	captionIndex,
	speechApi,
	registerEl
}: Props) {
	const app = useApp();
	const articleRef = useRef<HTMLElement>(null);
	const captionsRef = useRef<HTMLDivElement>(null);
	const visualRef = useRef<HTMLDivElement>(null);
	const mediaRef = useRef(
		createPostMediaController({
			junkImageRe: /(?!)/,
			isPlaybackPaused: () => app.playbackPaused,
			isActivePost: (el) => el === articleRef.current && active,
			getCaptionWords: () => [
				...(captionsRef.current?.querySelectorAll<HTMLElement>(".caption-word") ||
					[])
			]
		})
	);
	const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
	const [pauseFlash, setPauseFlash] = useState(false);
	const [toast, setToast] = useState<string | null>(null);
	const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingTap = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastTapAt = useRef(0);
	const pointerStart = useRef<{ x: number; y: number } | null>(null);
	const gestureMoved = useRef(false);
	const holdingSpeed = useRef(false);
	const scrubbing = useRef(false);
	const wasPausedScrub = useRef(false);
	const scrubIndex = useRef(0);

	const liked = app.isLiked(post.id);
	const disliked = app.isDisliked(post.id);
	const muted = app.settings.muted;
	const topic = app.appData ? classifyPostTopic(post, app.appData.topicGroups) : null;

	useEffect(() => {
		registerEl?.(post.id, articleRef.current);
		return () => registerEl?.(post.id, null);
	}, [post.id, registerEl]);

	useEffect(() => {
		if (app.appData)
			mediaRef.current = createPostMediaController({
				junkImageRe: app.appData.junkImageRe,
				isPlaybackPaused: () => app.playbackPaused,
				isActivePost: (el) => el === articleRef.current && !!el.dataset.active,
				getCaptionWords: () => [
					...(captionsRef.current?.querySelectorAll<HTMLElement>(
						".caption-word"
					) || [])
				]
			});
	}, [app.appData, app.playbackPaused]);

	const buildCaptions = useEffectEvent(() => {
		const el = captionsRef.current;
		if (!el || !app.appData) return;
		buildCaptionWords(el, post.text, post, app.appData, {
			wikiLang: post.wikiLang || app.settings.wikiLang,
			langBcp47: app.appData.wikiLanguages.find(
				(l) => l.code === (post.wikiLang || app.settings.wikiLang)
			)?.bcp47,
			findRelated: findRelatedInSummary
		});
	});

	useEffect(() => {
		buildCaptions();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- buildCaptions is an Effect Event
	}, [post.id, post.text, app.appData]);

	useEffect(() => {
		const article = articleRef.current;
		if (!article || !app.appData) return;
		void hydratePostImages(article, post, {
			wikiQuery: (params, opts) =>
				wikiQuery(params, {
					...opts,
					settingsWikiLang: app.settings.wikiLang
				}),
			lang: post.wikiLang || app.settings.wikiLang,
			junkImageRe: app.appData.junkImageRe,
			media: mediaRef.current,
			prefetchRelatedThumbs: (p) => prefetchRelatedThumbs(p, app.settings),
			getPageById,
			isActivePost: (el) => el.dataset.active === "1",
			findRelated: findRelatedInSummary
		});
		// Re-hydrate when the post identity / wiki lang changes, not every settings object identity.
		// eslint-disable-next-line react-hooks/exhaustive-deps -- stable post.id + lang
	}, [post.id, post.wikiLang, app.appData, app.settings.wikiLang]);

	useEffect(() => {
		const article = articleRef.current;
		if (!article) return;
		if (active) {
			article.dataset.active = "1";
			mediaRef.current.startImageSlideshow(article);
		} else {
			delete article.dataset.active;
			mediaRef.current.stopImageSlideshow(article);
			delete article.dataset.paused;
		}
	}, [active]);

	useEffect(() => {
		const article = articleRef.current;
		if (!article || !active) return;
		if (app.playbackPaused) article.dataset.paused = "1";
		else {
			const was = !!article.dataset.paused;
			delete article.dataset.paused;
			if (was) {
				setPauseFlash(true);
				setTimeout(() => setPauseFlash(false), 400);
			}
		}
	}, [app.playbackPaused, active]);

	useEffect(() => {
		const words = captionsRef.current?.querySelectorAll<HTMLElement>(".caption-word");
		if (!words?.length || !active) return;
		const colors = app.appData?.capRoleColors || {};
		words.forEach((w, idx) => {
			w.classList.toggle("spoken", idx < captionIndex);
			w.classList.toggle("active", idx === captionIndex);
			if (idx === captionIndex) {
				const role = w.dataset.capRole || "other";
				w.style.setProperty("--cap-color", colors[role] || colors.other || "");
			}
		});
		const word = words[captionIndex] || null;
		if (articleRef.current)
			mediaRef.current.syncCaptionLinkedImage(articleRef.current, word);
	}, [captionIndex, active, app.appData]);

	useEffect(() => {
		const el = articleRef.current;
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				let best: Element | null = null;
				let bestRatio = 0;
				entries.forEach((entry) => {
					if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
						bestRatio = entry.intersectionRatio;
						best = entry.target;
					}
				});
				if (best && bestRatio >= 0.6) onActivate(post.id);
			},
			{ root: el.parentElement, threshold: [0.6, 0.85, 1] }
		);
		io.observe(el);
		return () => io.disconnect();
	}, [post.id, onActivate]);

	const wordCount = Math.max(1, post.text.trim().split(/\s+/).filter(Boolean).length);
	const progress = wordCount > 1 ? (captionIndex / (wordCount - 1)) * 100 : 100;

	const initialFile = normalizeFileTitle(post.thumb);

	const onPointerDown = (e: ReactPointerEvent) => {
		if (
			(e.target as HTMLElement).closest(
				".sideActions, .iconBtn, a, button, .playbackProgress"
			)
		)
			return;
		pointerStart.current = { x: e.clientX, y: e.clientY };
		gestureMoved.current = false;
		holdingSpeed.current = false;
		holdTimer.current = setTimeout(() => {
			if (gestureMoved.current || !active) return;
			holdingSpeed.current = true;
			app.setRate(2);
		}, 320);
	};

	const onPointerMove = (e: ReactPointerEvent) => {
		if (!pointerStart.current) return;
		if (
			Math.hypot(
				e.clientX - pointerStart.current.x,
				e.clientY - pointerStart.current.y
			) > 12
		) {
			gestureMoved.current = true;
			if (holdTimer.current) {
				clearTimeout(holdTimer.current);
				holdTimer.current = null;
			}
			if (holdingSpeed.current) {
				holdingSpeed.current = false;
				app.setRate(1);
			}
		}
	};

	const onPointerUp = (e: ReactPointerEvent) => {
		if (holdTimer.current) {
			clearTimeout(holdTimer.current);
			holdTimer.current = null;
		}
		if (holdingSpeed.current) {
			holdingSpeed.current = false;
			app.setRate(1);
			pointerStart.current = null;
			return;
		}
		if (gestureMoved.current || !pointerStart.current) {
			pointerStart.current = null;
			return;
		}
		if (
			(e.target as HTMLElement).closest(
				".sideActions, .iconBtn, a, button, .playbackProgress"
			)
		) {
			pointerStart.current = null;
			return;
		}
		const now = Date.now();
		if (now - lastTapAt.current < DOUBLE_TAP_MS) {
			if (pendingTap.current) {
				clearTimeout(pendingTap.current);
				pendingTap.current = null;
			}
			lastTapAt.current = 0;
			app.likePost(post);
			const rect = articleRef.current?.getBoundingClientRect();
			if (rect) setBurst({ x: e.clientX - rect.left, y: e.clientY - rect.top });
			setTimeout(() => setBurst(null), 700);
		} else {
			lastTapAt.current = now;
			pendingTap.current = setTimeout(() => {
				pendingTap.current = null;
				if (active) app.togglePause();
			}, DOUBLE_TAP_MS);
		}
		pointerStart.current = null;
	};

	const indexFromProgress = (clientX: number) => {
		const progressEl = articleRef.current?.querySelector(".playbackProgress");
		if (!progressEl) return 0;
		const words = captionsRef.current?.querySelectorAll(".caption-word").length || 1;
		const rect = progressEl.getBoundingClientRect();
		const ratio = Math.min(
			1,
			Math.max(0, (clientX - rect.left) / Math.max(1, rect.width))
		);
		return Math.round(ratio * (words - 1));
	};

	return (
		<article
			ref={articleRef}
			className="post"
			data-post-id={post.id}
			data-slug={titleToSlug(post.title)}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={() => {
				if (holdTimer.current) clearTimeout(holdTimer.current);
				holdTimer.current = null;
				if (holdingSpeed.current) {
					holdingSpeed.current = false;
					app.setRate(1);
				}
				pointerStart.current = null;
			}}
		>
			<div className="visual" ref={visualRef}>
				{initialFile ? (
					<img
						src={commonsThumbUrl(initialFile)}
						className="media"
						alt=""
						draggable={false}
						data-file={initialFile.toLowerCase()}
						data-active="1"
						loading="eager"
					/>
				) : null}
			</div>

			<div
				className="speedBadge"
				aria-hidden="true"
				{...(app.playbackRate > 1 ? { "data-show": "1" } : {})}
			>
				<Icon className="overlayIcon" name="fast-forward" size={40} />
			</div>

			<div
				className="pauseIcon"
				aria-hidden="true"
				{...(pauseFlash ? { "data-flash": "1" } : {})}
			>
				<Icon
					className="overlayIcon"
					name={app.playbackPaused ? "pause" : "play"}
					size={40}
				/>
			</div>

			<div
				className="playbackProgress"
				role="slider"
				aria-label="Scrub narration"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(progress)}
				tabIndex={0}
				style={{ ["--progress" as string]: `${progress}%` }}
				onKeyDown={(e) => {
					if (!active || !speechApi) return;
					const words =
						captionsRef.current?.querySelectorAll(".caption-word").length ||
						1;
					const max = Math.max(0, words - 1);
					let next = captionIndex;
					if (e.key === "ArrowLeft") next = Math.max(0, captionIndex - 1);
					else if (e.key === "ArrowRight")
						next = Math.min(max, captionIndex + 1);
					else if (e.key === "Home") next = 0;
					else if (e.key === "End") next = max;
					else return;
					e.preventDefault();
					speechApi.seek(next, !app.playbackPaused);
				}}
				onPointerDown={(e) => {
					if (!active) return;
					e.preventDefault();
					e.stopPropagation();
					scrubbing.current = true;
					wasPausedScrub.current = app.playbackPaused;
					(e.currentTarget as HTMLElement).dataset.scrubbing = "1";
					try {
						e.currentTarget.setPointerCapture(e.pointerId);
					} catch {
						/* older engines */
					}
					scrubIndex.current =
						speechApi?.previewSeek(indexFromProgress(e.clientX)) ??
						indexFromProgress(e.clientX);
				}}
				onPointerMove={(e) => {
					if (!scrubbing.current) return;
					e.preventDefault();
					scrubIndex.current =
						speechApi?.previewSeek(indexFromProgress(e.clientX)) ??
						indexFromProgress(e.clientX);
				}}
				onPointerUp={() => {
					if (!scrubbing.current) return;
					scrubbing.current = false;
					articleRef.current
						?.querySelector(".playbackProgress")
						?.removeAttribute("data-scrubbing");
					speechApi?.seek(scrubIndex.current, !wasPausedScrub.current);
					if (!wasPausedScrub.current) app.setPaused(false);
					else app.setPaused(true);
				}}
			/>

			<div className="overlay">
				<div className="postMeta">
					<p className="sourceLine" hidden={!topic}>
						{topic?.label || ""}
					</p>
					<h1>{post.title}</h1>
					<div className="captions" aria-live="polite" ref={captionsRef} />
					<p className="sr-only">{post.text}</p>
				</div>
			</div>

			<div className="sideActions">
				<div
					className="wikiAvatar"
					role="img"
					aria-label={topic?.label || "Topic"}
					title={topic?.label || ""}
					style={
						topic
							? { ["--avatar-accent" as string]: topic.accent }
							: undefined
					}
				>
					{topic?.emoji || "✨"}
				</div>
				<Action
					className="likeBtn"
					icon={liked ? "heart-fill" : "heart"}
					label={liked ? "Liked" : "Like"}
					ariaLabel={liked ? "Unlike" : "Like"}
					ariaPressed={liked}
					dataAttrs={liked ? { liked: "1" } : {}}
					onClick={(e) => {
						e.stopPropagation();
						app.likePost(post);
						if (!liked) {
							const rect = articleRef.current?.getBoundingClientRect();
							if (rect)
								setBurst({
									x: e.clientX - rect.left,
									y: e.clientY - rect.top
								});
							setTimeout(() => setBurst(null), 700);
						}
					}}
				/>
				<Action
					className="dislikeBtn"
					icon="dislike"
					label={disliked ? "Disliked" : "Dislike"}
					ariaLabel={disliked ? "Remove dislike" : "Dislike"}
					ariaPressed={disliked}
					dataAttrs={disliked ? { disliked: "1" } : {}}
					onClick={(e) => {
						e.stopPropagation();
						app.dislikePost(post);
					}}
				/>
				<Action
					className="shareBtn"
					icon="share"
					label="Share"
					ariaLabel="Share article"
					onClick={(e) => {
						e.stopPropagation();
						void (async () => {
							const result = await app.sharePost(post);
							if (result === "copied") setToast("Link copied");
							else if (result === "shared") setToast("Shared");
							else if (result === "failed") setToast("Couldn't share");
							if (result !== "aborted") {
								window.setTimeout(() => setToast(null), 2000);
							}
						})();
					}}
				/>
				<Action
					className="muteBtn"
					icon={muted ? "volume-mute" : "volume"}
					label={muted ? "Muted" : "Sound"}
					ariaLabel={muted ? "Unmute" : "Mute"}
					ariaPressed={muted}
					dataAttrs={muted ? { muted: "1" } : {}}
					onClick={(e) => {
						e.stopPropagation();
						app.setMuted(!muted);
					}}
				/>
				<Action
					className="descBtn"
					icon="more"
					label="More"
					ariaLabel="Description"
					onClick={(e) => {
						e.stopPropagation();
						app.openDescription(post);
					}}
				/>
			</div>

			{burst ? (
				<div className="heartBurst" style={{ left: burst.x, top: burst.y }}>
					<Icon className="heartBurstIcon" name="heart-fill" size={80} />
				</div>
			) : null}
			{toast ? (
				<div className="shareToast" role="status" aria-live="polite">
					{toast}
				</div>
			) : null}
		</article>
	);
}

function Action({
	className,
	icon,
	label,
	ariaLabel,
	ariaPressed,
	onClick,
	dataAttrs = {}
}: {
	className: string;
	icon: string;
	label: string;
	ariaLabel: string;
	ariaPressed?: boolean;
	onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
	dataAttrs?: Record<string, string>;
}) {
	return (
		<div className="actionItem">
			<button
				type="button"
				className={`iconBtn ${className}`}
				aria-label={ariaLabel}
				aria-pressed={ariaPressed}
				onClick={onClick}
				{...Object.fromEntries(
					Object.entries(dataAttrs).map(([k, v]) => [`data-${k}`, v])
				)}
			>
				<Icon name={icon} size={32} />
			</button>
			<span className="actionLabel">{label}</span>
		</div>
	);
}
