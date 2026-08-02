import { state } from "./state.js";
state.setPlaybackRate = function setPlaybackRate(rate) {
	state.playbackRate = rate;
	if (state.activePostEl) {
		const badge = state.activePostEl.querySelector(".speedBadge");
		if (badge) {
			if (rate > 1) badge.dataset.show = "1";
			else delete badge.dataset.show;
		}
	}
	if (state.playbackPaused || !state.activePostEl || !state.activePostData) return;
	// Web Speech can't change rate mid-utterance, so restart from the current word.
	state.speakFrom(state.activePostEl, state.activePostData, state.captionIndex);
}

state.clearLike = function clearLike(postEl, post) {
	const likeBtn = postEl?.querySelector?.(".likeBtn") || postEl;
	if (!likeBtn?.dataset?.liked) return false;
	delete likeBtn.dataset.liked;
	state.likedPosts = state.likedPosts.filter(id => id != post.id);
	if (likeBtn.dataset.engaged) {
		state.engagePost(post, -Number(likeBtn.dataset.engaged));
		delete likeBtn.dataset.engaged;
	}
	likeBtn.setAttribute("aria-label", "Like");
	if (likeBtn._actionLabel) likeBtn._actionLabel.textContent = "Like";
	state.setIconImg(likeBtn, "heart");
	return true;
}

state.clearDislike = function clearDislike(postEl, post) {
	const dislikeBtn = postEl?.querySelector?.(".dislikeBtn") || postEl;
	if (!dislikeBtn?.dataset?.disliked) return false;
	delete dislikeBtn.dataset.disliked;
	state.dislikedPosts = state.dislikedPosts.filter(id => id != post.id);
	if (dislikeBtn.dataset.engaged) {
		state.engagePost(post, -Number(dislikeBtn.dataset.engaged));
		delete dislikeBtn.dataset.engaged;
	}
	dislikeBtn.setAttribute("aria-label", "Dislike");
	if (dislikeBtn._actionLabel) dislikeBtn._actionLabel.textContent = "Dislike";
	return true;
}

state.likePost = function likePost(postEl, post, likeBtn, clientX, clientY) {
	if (likeBtn.dataset.liked) {
		state.clearLike(likeBtn, post);
		setTimeout(state.saveProfile, 100);
		return;
	}
	state.clearDislike(postEl, post);
	likeBtn.dataset.liked = "1";
	if (!state.likedPosts.includes(post.id))
		state.likedPosts.push(post.id);
	if (!likeBtn.dataset.engaged)
		likeBtn.dataset.engaged = state.engagePost(post, 50 + state.postsWithoutLike * 4);
	state.postsWithoutLike = 0;
	likeBtn.setAttribute("aria-label", "Unlike");
	if (likeBtn._actionLabel) likeBtn._actionLabel.textContent = "Liked";
	state.setIconImg(likeBtn, "heart-fill");
	setTimeout(state.saveProfile, 100);
	if (clientX != null && clientY != null) {
		const rect = postEl.getBoundingClientRect();
		const burst = document.createElement("div");
		burst.className = "heartBurst";
		burst.style.left = `${clientX - rect.left}px`;
		burst.style.top = `${clientY - rect.top}px`;
		burst.appendChild(state.makeIconImg("heart-fill", "heartBurstIcon"));
		postEl.appendChild(burst);
		setTimeout(() => burst.remove(), 700);
	}
}

state.dislikePost = function dislikePost(postEl, post, dislikeBtn) {
	if (dislikeBtn.dataset.disliked) {
		state.clearDislike(dislikeBtn, post);
		setTimeout(state.saveProfile, 100);
		return;
	}
	state.clearLike(postEl, post);
	dislikeBtn.dataset.disliked = "1";
	if (!state.dislikedPosts.includes(post.id))
		state.dislikedPosts.push(post.id);
	if (!dislikeBtn.dataset.engaged)
		dislikeBtn.dataset.engaged = state.engagePost(post, -(50 + state.postsWithoutLike * 4));
	state.postsWithoutLike = 0;
	dislikeBtn.setAttribute("aria-label", "Remove dislike");
	if (dislikeBtn._actionLabel) dislikeBtn._actionLabel.textContent = "Disliked";
	setTimeout(state.saveProfile, 100);
}

state.openDescription = function openDescription(postEl, post) {
	state.descPostEl = postEl;
	document.getElementById("descTitle").innerText = post.title;
	document.getElementById("descSummary").innerText = post.text;
	const linksEl = document.getElementById("descLinks");
	linksEl.innerHTML = "";
	const related = state.findRelatedInSummary(post);
	related.forEach(rel => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.innerText = rel.title;
		btn.onclick = () => {
			state.descriptionSheet.close();
			state.jumpToRelatedPost(postEl, rel.page);
		};
		linksEl.appendChild(btn);
	});
	document.getElementById("descOpenArticle").onclick = () => {
		window.open(state.getArticleLink(post.title, true));
		if (!postEl.dataset.articleEngaged)
			postEl.dataset.articleEngaged = state.engagePost(post, 75);
		setTimeout(state.saveProfile, 100);
	};
	state.pausePlayback();
	state.descriptionSheet.showModal();
}

state.descriptionSheet?.querySelectorAll(".closeDesc").forEach(btn => {
	btn.onclick = () => state.descriptionSheet.close();
});
state.descriptionSheet?.addEventListener("close", () => {
	if (state.activePostEl && !state.appPageIsOpen()) state.resumePlayback();
});

state.buildPostElement = function buildPostElement(post) {
	const postDiv = document.createElement("article");
	postDiv.classList.add("post");
	postDiv.dataset.postId = post.id;
	postDiv.dataset.slug = state.titleToSlug(post.title);
	postDiv._slideIndex = 0;

	const visual = document.createElement("div");
	visual.className = "visual";
	const initial = state.normalizeFileTitle(post.thumb);
	if (initial) {
		const postImg = state.makeMediaImg(state.commonsThumbUrl(initial));
		postImg.dataset.file = initial.toLowerCase();
		postImg.dataset.active = "1";
		postImg.loading = "eager";
		postImg._visual = visual;
		visual.appendChild(postImg);
	}
	postDiv.appendChild(visual);
	state.hydratePostImages(postDiv, post);

	const speedBadge = document.createElement("div");
	speedBadge.className = "speedBadge";
	speedBadge.setAttribute("aria-hidden", "true");
	speedBadge.appendChild(state.makeIconImg("fast-forward", "overlayIcon"));
	postDiv.appendChild(speedBadge);

	const pauseIcon = document.createElement("div");
	pauseIcon.className = "pauseIcon";
	pauseIcon.setAttribute("aria-hidden", "true");
	pauseIcon.appendChild(state.makeIconImg("pause", "overlayIcon"));
	pauseIcon.addEventListener("animationend", () => delete pauseIcon.dataset.flash);
	postDiv.appendChild(pauseIcon);

	const progress = document.createElement("div");
	progress.className = "playbackProgress";
	progress.setAttribute("role", "slider");
	progress.setAttribute("aria-label", "Scrub narration");
	progress.setAttribute("aria-valuemin", "0");
	progress.setAttribute("aria-valuemax", "100");
	progress.setAttribute("aria-valuenow", "0");
	progress.setAttribute("tabindex", "0");
	progress.style.setProperty("--progress", "0%");
	postDiv.appendChild(progress);
	state.bindProgressScrub(progress, postDiv, post);

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
	state.buildCaptionWords(captions, post.text, post);
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
	state.hydrateArticleAvatar(avatar, post, sourceLine);

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
	const liked = state.likedPosts.includes(post.id);
	if (liked) {
		likeBtn.dataset.liked = "1";
		likeBtn.setAttribute("aria-label", "Unlike");
	}
	likeBtn.appendChild(state.makeIconImg(liked ? "heart-fill" : "heart"));
	likeBtn.onclick = (e) => {
		e.stopPropagation();
		state.likePost(postDiv, post, likeBtn, e.clientX, e.clientY);
	};
	const dislikeBtn = document.createElement("button");
	dislikeBtn.type = "button";
	dislikeBtn.className = "iconBtn dislikeBtn";
	dislikeBtn.setAttribute("aria-label", "Dislike");
	if (state.dislikedPosts.includes(post.id)) {
		dislikeBtn.dataset.disliked = "1";
		dislikeBtn.setAttribute("aria-label", "Remove dislike");
	}
	dislikeBtn.appendChild(state.makeIconImg("dislike"));
	dislikeBtn.onclick = (e) => {
		e.stopPropagation();
		state.dislikePost(postDiv, post, dislikeBtn);
	};
	const shareBtn = document.createElement("button");
	shareBtn.type = "button";
	shareBtn.className = "iconBtn shareBtn";
	shareBtn.setAttribute("aria-label", "Share article");
	shareBtn.appendChild(state.makeIconImg("share"));
	shareBtn.onclick = (e) => {
		e.stopPropagation();
		state.shareArticle(post, shareBtn);
	};
	const muteBtn = document.createElement("button");
	muteBtn.type = "button";
	muteBtn.className = "iconBtn muteBtn";
	muteBtn.setAttribute("aria-label", "Mute");
	if (state.settings.muted) muteBtn.dataset.muted = "1";
	muteBtn.appendChild(state.makeIconImg(state.settings.muted ? "volume-mute" : "volume"));
	muteBtn.onclick = (e) => {
		e.stopPropagation();
		state.setMuted(!state.settings.muted);
	};
	const descBtn = document.createElement("button");
	descBtn.type = "button";
	descBtn.className = "iconBtn descBtn";
	descBtn.setAttribute("aria-label", "Description");
	descBtn.appendChild(state.makeIconImg("more"));
	descBtn.onclick = (e) => {
		e.stopPropagation();
		state.openDescription(postDiv, post);
	};
	side.appendChild(makeActionItem(likeBtn, likeBtn.dataset.liked ? "Liked" : "Like"));
	side.appendChild(makeActionItem(dislikeBtn, dislikeBtn.dataset.disliked ? "Disliked" : "Dislike"));
	side.appendChild(makeActionItem(shareBtn, "Share"));
	side.appendChild(makeActionItem(muteBtn, state.settings.muted ? "Muted" : "Sound"));
	side.appendChild(makeActionItem(descBtn, "More"));
	postDiv.appendChild(side);

	state.bindPostGestures(postDiv, post, likeBtn);
	postDiv._postData = post;
	return postDiv;
}

state.bindProgressScrub = function bindProgressScrub(progressEl, postEl, post) {
	let scrubbing = false;
	let wasPaused = false;
	let lastIndex = 0;

	const begin = (e) => {
		if (state.activePostEl !== postEl) return;
		e.preventDefault();
		e.stopPropagation();
		scrubbing = true;
		wasPaused = !!state.playbackPaused;
		progressEl.dataset.scrubbing = "1";
		try { progressEl.setPointerCapture(e.pointerId); } catch { /* older engines */ }
		if (state.holdTimer) {
			clearTimeout(state.holdTimer);
			state.holdTimer = null;
		}
		state.holdingSpeed = false;
		state.pointerStart = null;
		if (state.pendingTapTimer) {
			clearTimeout(state.pendingTapTimer);
			state.pendingTapTimer = null;
		}
		lastIndex = state.previewCaptionSeek(
			postEl,
			state.captionIndexFromProgressEvent(progressEl, postEl, e),
		);
	};

	const move = (e) => {
		if (!scrubbing) return;
		e.preventDefault();
		lastIndex = state.previewCaptionSeek(
			postEl,
			state.captionIndexFromProgressEvent(progressEl, postEl, e),
		);
	};

	const end = () => {
		if (!scrubbing) return;
		scrubbing = false;
		delete progressEl.dataset.scrubbing;
		state.seekCaptionToIndex(postEl, post, lastIndex, { resume: !wasPaused });
	};

	progressEl.addEventListener("pointerdown", begin);
	progressEl.addEventListener("pointermove", move);
	progressEl.addEventListener("pointerup", end);
	progressEl.addEventListener("pointercancel", end);

	progressEl.addEventListener("keydown", (e) => {
		if (state.activePostEl !== postEl) return;
		const words = postEl.querySelectorAll(".caption-word");
		if (!words.length) return;
		let next = state.captionIndex || 0;
		const step = Math.max(1, Math.round(words.length / 20));
		if (e.key === "ArrowRight" || e.key === "ArrowUp") next += step;
		else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next -= step;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = words.length - 1;
		else return;
		e.preventDefault();
		e.stopPropagation();
		state.seekCaptionToIndex(postEl, post, next, { resume: !state.playbackPaused });
	});
};

state.bindPostGestures = function bindPostGestures(postDiv, post, likeBtn) {
	postDiv.addEventListener("pointerdown", (e) => {
		if (e.target.closest(".sideActions, .iconBtn, a, button, .playbackProgress")) return;
		state.pointerDownAt = Date.now();
		state.pointerStart = { x: e.clientX, y: e.clientY };
		state.gestureMoved = false;
		state.holdingSpeed = false;
		state.holdTimer = setTimeout(() => {
			if (state.gestureMoved || state.activePostEl !== postDiv) return;
			state.holdingSpeed = true;
			state.setPlaybackRate(2);
		}, 320);
	});
	postDiv.addEventListener("pointermove", (e) => {
		if (!state.pointerStart) return;
		if (Math.hypot(e.clientX - state.pointerStart.x, e.clientY - state.pointerStart.y) > 12) {
			state.gestureMoved = true;
			if (state.holdTimer) {
				clearTimeout(state.holdTimer);
				state.holdTimer = null;
			}
			if (state.holdingSpeed) {
				state.holdingSpeed = false;
				state.setPlaybackRate(1);
			}
		}
	});
	const endPointer = (e) => {
		if (state.holdTimer) {
			clearTimeout(state.holdTimer);
			state.holdTimer = null;
		}
		if (state.holdingSpeed) {
			state.holdingSpeed = false;
			state.setPlaybackRate(1);
			state.pointerStart = null;
			return;
		}
		if (state.gestureMoved || !state.pointerStart) {
			state.pointerStart = null;
			return;
		}
		if (e.target.closest(".sideActions, .iconBtn, a, button, .playbackProgress")) {
			state.pointerStart = null;
			return;
		}
		const now = Date.now();
		if (now - state.lastTapAt < state.DOUBLE_TAP_MS) {
			if (state.pendingTapTimer) {
				clearTimeout(state.pendingTapTimer);
				state.pendingTapTimer = null;
			}
			state.lastTapAt = 0;
			state.likePost(postDiv, post, likeBtn, e.clientX, e.clientY);
		} else {
			state.lastTapAt = now;
			state.pendingTapTimer = setTimeout(() => {
				state.pendingTapTimer = null;
				if (state.activePostEl === postDiv)
					state.togglePause();
			}, state.DOUBLE_TAP_MS);
		}
		state.pointerStart = null;
	};
	postDiv.addEventListener("pointerup", endPointer);
	postDiv.addEventListener("pointercancel", () => {
		if (state.holdTimer) clearTimeout(state.holdTimer);
		state.holdTimer = null;
		if (state.holdingSpeed) {
			state.holdingSpeed = false;
			state.setPlaybackRate(1);
		}
		state.pointerStart = null;
	});
}

state.setActivePost = function setActivePost(postEl, forceSpeak) {
	if (!postEl) return;
	if (state.activePostEl === postEl && !forceSpeak) return;
	if (state.activePostEl && state.activePostEl !== postEl) {
		if (!state.activePostEl.dataset.scrollEngaged && state.activePostEl._postData) {
			state.activePostEl.dataset.scrollEngaged = state.engagePost(state.activePostEl._postData, -5);
		}
		state.setPausedUi(state.activePostEl, false);
		state.stopImageSlideshow(state.activePostEl);
	}
	state.activePostEl = postEl;
	state.activePostData = postEl._postData;
	state.playbackRate = 1;
	state.playbackPaused = false;
	state.startImageSlideshow(postEl);
	state.speakPost(postEl, state.activePostData, { restart: true });
	const historyMode = state._routeHistoryMode || "replace";
	state._routeHistoryMode = "replace";
	if (historyMode !== "none" && postEl._postData)
		state.syncPostSlugToLocation(postEl._postData, { replace: historyMode !== "push" });
	state.ensurePrefetch();
	setTimeout(state.saveProfile, 100);
}

state.ensureFeedObserver = function ensureFeedObserver() {
	if (state.feedObserver) return;
	state.feedObserver = new IntersectionObserver((entries) => {
		let best = null;
		let bestRatio = 0;
		entries.forEach(entry => {
			if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
				bestRatio = entry.intersectionRatio;
				best = entry.target;
			}
		});
		if (best && bestRatio >= 0.6)
			state.setActivePost(best);
		state.ensurePrefetch();
	}, {
		root: state.postsRoot(),
		threshold: [0.6, 0.85, 1],
	});
}

state.observePost = function observePost(postEl) {
	state.ensureFeedObserver();
	state.feedObserver.observe(postEl);
}

state.appendPost = function appendPost(post) {
	const el = state.buildPostElement(post);
	state.postsRoot().appendChild(el);
	state.observePost(el);
	return el;
}

state.createNextPost = async function createNextPost() {
	if (!state.feedReady) return null;
	const post = await state.getNextPost();
	if (!post) return null;
	return state.appendPost(post);
}

state.ensurePrefetch = async function ensurePrefetch() {
	const root = state.postsRoot();
	if (!root || !state.feedReady || state.prefetchBusy) return;
	state.prefetchBusy = true;
	try {
		while (root.children.length < state.PREFETCH_AHEAD) {
			const created = await state.createNextPost();
			if (!created) break;
		}
		if (!state.activePostEl) return;
		const posts = [...root.querySelectorAll(".post")];
		let idx = posts.indexOf(state.activePostEl);
		while (posts.length - idx - 1 < state.PREFETCH_AHEAD) {
			const created = await state.createNextPost();
			if (!created) break;
			posts.push(created);
			idx = posts.indexOf(state.activePostEl);
		}
	} finally {
		state.prefetchBusy = false;
	}
}

state.jumpToRelatedPost = async function jumpToRelatedPost(fromEl, page) {
	let full = page;
	if (!page?.text || page.text.length < 20) {
		const hydrated = await state.hydrateByPageIds([page.id]);
		full = hydrated[0] || page;
	} else {
		await state.prefetchRelatedThumbs(page);
	}
	state.engagePost(full, 75);
	state.markPostSeen(full);
	setTimeout(state.saveProfile, 100);
	const el = state.buildPostElement(full);
	fromEl.after(el);
	state.observePost(el);
	el.scrollIntoView({ behavior: "smooth", block: "start" });
	state._routeHistoryMode = "push";
	requestAnimationFrame(() => state.setActivePost(el, true));
	state.ensurePrefetch();
}


export const setActivePost = (...args) => state.setActivePost(...args);
