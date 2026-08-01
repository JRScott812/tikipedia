import { state } from "./state.js";
state.isNoiseTopic = function isNoiseTopic(category) {
	const name = String(category || "").toLowerCase().trim();
	if (!name || name.startsWith("p:")) return true;
	return state.TOPIC_NOISE_RE.some(re => re.test(name));
}

state.formatTopicLabel = function formatTopicLabel(category) {
	const raw = state.convertCat(category);
	return String(raw)
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, ch => ch.toUpperCase());
}

state.classifyTopicGroup = function classifyTopicGroup(category) {
	const name = String(category || "").toLowerCase();
	for (const group of state.TOPIC_GROUPS) {
		if (group.id === "other") continue;
		if (group.id === "science" && /\bfiction\b/.test(name)) continue;
		if (group.patterns.some(re => re.test(name)))
			return group;
	}
	return state.TOPIC_GROUPS[state.TOPIC_GROUPS.length - 1];
}

state.classifyPostTopic = function classifyPostTopic(post) {
	const scores = new Map();
	const addMatch = (text, weight) => {
		const name = String(text || "").toLowerCase();
		state.TOPIC_GROUPS.forEach(group => {
			if (group.id === "other") return;
			if (group.id === "science" && /\bfiction\b/.test(name)) return;
			if (group.patterns.some(re => re.test(name)))
				scores.set(group.id, (scores.get(group.id) || 0) + weight);
		});
	};
	addMatch(post?.title, 3);
	(post?.categories || []).forEach(category => addMatch(category, 1));
	let best = state.TOPIC_GROUPS[state.TOPIC_GROUPS.length - 1];
	let bestScore = 0;
	state.TOPIC_GROUPS.forEach(group => {
		const score = scores.get(group.id) || 0;
		if (score > bestScore) {
			best = group;
			bestScore = score;
		}
	});
	return best;
}

state.articleRepCache = new Map();
state.templateMetaCache = new Map();

state.groupForSubject = function groupForSubject(subject) {
	const hit = state.classifyTopicGroup(subject);
	return hit?.id === "other" ? state.classifyTopicGroup(`${subject} topic`) : hit;
}

state.representationCategoryLabel = function representationCategoryLabel(rep) {
	if (!rep) return "";
	if (rep.kind === "stub" && rep.subject)
		return String(rep.subject).replace(/\b\w/g, ch => ch.toUpperCase());
	if (rep.kind === "series" && rep.subject)
		return String(rep.subject).trim();
	return rep.group?.label || rep.label || "";
}

state.applyAvatarRepresentation = function applyAvatarRepresentation(avatar, rep, sourceLine) {
	if (!avatar || !rep) return;
	avatar.style.setProperty("--avatar-accent", rep.accent || "#2cafff");
	avatar.dataset.repKind = rep.kind || "topic";
	avatar.title = rep.label;
	avatar.setAttribute("aria-label", rep.label);
	avatar.replaceChildren();
	if (rep.image) {
		const img = document.createElement("img");
		img.src = state.commonsThumbUrl(rep.image, 96);
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
		const category = state.representationCategoryLabel(rep);
		sourceLine.textContent = category;
		sourceLine.hidden = !category;
	}
}

state.fetchTemplateMeta = async function fetchTemplateMeta(templateTitle) {
	const key = `${state.settings.wikiLang}:${templateTitle.replace(/^Template:/i, "")}`;
	if (state.templateMetaCache.has(key)) return state.templateMetaCache.get(key);
	const promise = (async () => {
		try {
			const data = await state.wikiQuery({
				action: "parse",
				page: `Template:${templateTitle.replace(/^Template:/i, "")}`,
				prop: "wikitext",
				redirects: 1,
			});
			return data?.parse?.wikitext?.["*"] || null;
		} catch {
			return null;
		}
	})();
	state.templateMetaCache.set(key, promise);
	return promise;
}

state.parseStubTemplateWikitext = function parseStubTemplateWikitext(wt) {
	if (!wt) return null;
	const image = wt.match(/\|\s*image\s*=\s*([^\n|}]+)/i)?.[1]?.trim();
	const subject = wt.match(/\|\s*subject\s*=\s*([^\n|}]+)/i)?.[1]?.trim();
	if (!subject && !image) return null;
	const group = state.groupForSubject(subject || "");
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

state.parseSeriesTemplateWikitext = function parseSeriesTemplateWikitext(wt) {
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
	const group = state.groupForSubject(subject || "religion");
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

state.resolveStubRepresentation = async function resolveStubRepresentation(templateTitles, categoryTitles) {
	const stubTemplate = (templateTitles || []).find(t =>
		/stub$/i.test(t.replace(/^Template:/i, "")) &&
		!/stub-template|uncategorized|multistub|^stub$/i.test(t.replace(/^Template:/i, ""))
	);
	if (stubTemplate) {
		const wt = await state.fetchTemplateMeta(stubTemplate);
		const parsed = state.parseStubTemplateWikitext(wt);
		if (parsed) return parsed;
		const subject = stubTemplate.replace(/^Template:/i, "").replace(/-stub$/i, "").replace(/-/g, " ");
		const group = state.groupForSubject(subject);
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
		const group = state.groupForSubject(subject);
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

state.resolveSeriesRepresentation = async function resolveSeriesRepresentation(templateTitles) {
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
		const wt = await state.fetchTemplateMeta(template);
		const parsed = state.parseSeriesTemplateWikitext(wt);
		if (parsed) return parsed;
	}
	return null;
}

state.fetchArticleRepresentation = async function fetchArticleRepresentation(post) {
	if (!post?.title && !post?.id) return null;
	const cacheKey = `${state.settings.wikiLang}:${post?.title || post?.id || ""}`;
	if (state.articleRepCache.has(cacheKey)) return state.articleRepCache.get(cacheKey);
	const promise = (async () => {
		try {
			const data = await state.wikiQuery({
				action: "query",
				redirects: 1,
				prop: "categories|templates",
				cllimit: 50,
				tllimit: 100,
				tlnamespace: 10,
				titles: post.title,
			});
			const page = Object.values(data?.query?.pages || {})[0] || {};
			const categories = (page.categories || []).map(c => c.title);
			const templates = (page.templates || [])
				.map(t => t.title)
				.filter(t => /^Template:/i.test(t));
			const stub = await state.resolveStubRepresentation(templates, categories);
			if (stub) return stub;
			const series = await state.resolveSeriesRepresentation(templates);
			if (series) return series;
			return null;
		} catch {
			return null;
		}
	})();
	state.articleRepCache.set(cacheKey, promise);
	return promise;
}

state.hydrateArticleAvatar = async function hydrateArticleAvatar(avatar, post, sourceLine) {
	if (!avatar || !post) return;
	const fallback = state.classifyPostTopic(post);
	state.applyAvatarRepresentation(avatar, {
		kind: "topic",
		label: fallback.label,
		emoji: fallback.emoji,
		accent: fallback.accent,
		image: null,
		group: fallback,
	}, sourceLine);
	const rep = await state.fetchArticleRepresentation(post);
	if (rep) state.applyAvatarRepresentation(avatar, rep, sourceLine);
}

state.getFollowedTopics = function getFollowedTopics(limit = 48) {
	return Object.entries(state.categoryScores)
		.filter(([category, score]) =>
			!state.isNoiseTopic(category) &&
			Number.isFinite(Number(score)) &&
			Number(score) > 0
		)
		.sort((a, b) => Number(b[1]) - Number(a[1]))
		.slice(0, limit)
		.map(([category, score]) => {
			const group = state.classifyTopicGroup(category);
			return {
				category,
				score: Number(score),
				group,
				label: state.formatTopicLabel(category),
			};
		});
}

// Topic art is loaded only for Following headers. It is intentionally kept
// separate from articleImageCache and never appended to a short's .visual.
state.topicIconCache = new Map();

state.fetchTopicIcon = function fetchTopicIcon(group) {
	if (!group?.wikiPage) return Promise.resolve(null);
	const cacheKey = `${state.settings.wikiLang}:${group.id}`;
	if (state.topicIconCache.has(cacheKey)) return state.topicIconCache.get(cacheKey);
	const promise = (async () => {
		try {
			const data = await state.wikiQuery({
				action: "query",
				redirects: 1,
				prop: "pageimages",
				pithumbsize: 128,
				titles: group.wikiPage,
			});
			const page = Object.values(data?.query?.pages || {})[0];
			return page?.thumbnail?.source || null;
		} catch {
			return null;
		}
	})();
	state.topicIconCache.set(cacheKey, promise);
	return promise;
}

state.makeTopicIcon = function makeTopicIcon(group) {
	const icon = document.createElement("span");
	icon.className = "followingSectionIcon";
	icon.setAttribute("aria-hidden", "true");
	icon.textContent = group.emoji;
	state.fetchTopicIcon(group).then(src => {
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

state.renderFollowingPage = function renderFollowingPage() {
	const feed = document.getElementById("followingGrid");
	const empty = document.getElementById("followingEmpty");
	if (!feed || !empty) return;
	feed.innerHTML = "";
	const topics = state.getFollowedTopics();
	empty.hidden = topics.length > 0;
	if (!topics.length) return;

	const maxScore = Math.max(...topics.map(t => t.score), 1);
	const byGroup = new Map();
	topics.forEach(topic => {
		const list = byGroup.get(topic.group.id) || [];
		list.push(topic);
		byGroup.set(topic.group.id, list);
	});

	const sections = state.TOPIC_GROUPS
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
		title.append(state.makeTopicIcon(section.group), section.group.label);
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


export const classifyPostTopic = (...args) => state.classifyPostTopic(...args);
