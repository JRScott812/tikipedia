import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AccountAvatar } from "../components/AccountAvatar";
import { useApp } from "../context/AppContext";
import { accountHandle, findAccount } from "../lib/accounts";
import { formatCompactNumber } from "../lib/format";
import { commonsThumbUrl, normalizeFileTitle } from "../lib/media";
import { rankByPageviews } from "../lib/popularity";
import { postPathForRoute, titleToSlug } from "../lib/routes";
import { syncDocumentMeta } from "../lib/site";
import { classifyPostTopic } from "../lib/topics";
import { fetchCategoryCandidates, getPageCache, wikiQuery } from "../lib/wiki";
import type { Post } from "../types/wiki";

interface ExtractPage {
	extract?: string;
}

/** Account page for a topic-group "account" — bio + its most popular shorts. */
export function AccountPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const app = useApp();
	const topicGroups = app.appData?.topicGroups || [];
	const group = findAccount(id, topicGroups);
	const following = !!(group && app.settings.followedAccounts.includes(group.id));

	const [blurb, setBlurb] = useState("");
	const [videos, setVideos] = useState<Array<Post & { views: number }> | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!group) return;
		syncDocumentMeta({
			title: `${accountHandle(group)} — Tikipedia`,
			path: `/account/${group.id}`
		});
	}, [group]);

	useEffect(() => {
		if (!group) return;
		let cancelled = false;
		setBlurb("");
		void (async () => {
			try {
				const data = (await wikiQuery(
					{
						action: "query",
						redirects: 1,
						titles: group.wikiPage,
						prop: "extracts",
						exintro: 1,
						explaintext: 1,
						exchars: 220
					},
					{
						lang: app.settings.wikiLang,
						settingsWikiLang: app.settings.wikiLang
					}
				)) as { query?: { pages?: Record<string, ExtractPage> } };
				const page = Object.values(data?.query?.pages || {})[0];
				if (!cancelled)
					setBlurb((page?.extract || "").replace(/\s+/g, " ").trim());
			} catch {
				/* description is a nice-to-have; ignore failures */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [group, app.settings.wikiLang]);

	useEffect(() => {
		if (!group || !app.appData) return;
		let cancelled = false;
		setLoading(true);
		setVideos(null);
		void (async () => {
			const local = [...getPageCache().values()].filter(
				(p) => classifyPostTopic(p, topicGroups).id === group.id
			);
			const seen = new Set(local.map((p) => p.id));
			const fetched = await fetchCategoryCandidates(
				group.wikiPage,
				app.settings,
				app.appData?.topicNoiseRe || [],
				16
			);
			fetched.forEach((p) => {
				if (!seen.has(p.id)) {
					seen.add(p.id);
					local.push(p);
				}
			});
			if (cancelled) return;
			const pool = local.slice(0, 24);
			if (!pool.length) {
				setVideos([]);
				setLoading(false);
				return;
			}
			const ranked = await rankByPageviews(
				pool,
				(p) => p.title,
				app.settings.wikiLang
			);
			if (!cancelled) {
				setVideos(ranked.slice(0, 12));
				setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- topicGroups is derived from app.appData
	}, [group?.id, app.appData]);

	if (!group) {
		return (
			<section className="appPage" id="accountPage">
				<p>Account not found.</p>
			</section>
		);
	}

	return (
		<section className="appPage" id="accountPage" aria-labelledby="accountTitle">
			<div
				className="accountHeader"
				style={{ ["--topic-accent" as string]: group.accent }}
			>
				<AccountAvatar group={group} size={84} />
				<h1 id="accountTitle">{accountHandle(group)}</h1>
				<p className="accountLabel">{group.label}</p>
				{blurb ? <p className="accountBlurb">{blurb}</p> : null}
				<button
					type="button"
					className="followBtn followBtn--lg"
					data-following={following ? "1" : undefined}
					aria-pressed={following}
					onClick={() => app.toggleFollowAccount(group.id)}
				>
					{following ? "Following" : "Follow"}
				</button>
			</div>

			<h2 className="accountSectionHead">Most popular</h2>
			{loading ? (
				<p className="accountLoading" role="status">
					Loading popular shorts…
				</p>
			) : videos && videos.length ? (
				<div className="accountVideoGrid">
					{videos.map((post) => {
						const thumb = normalizeFileTitle(post.thumb);
						return (
							<button
								type="button"
								key={post.id}
								className="accountVideoCard"
								onClick={() =>
									navigate(
										postPathForRoute(
											{
												lang: post.wikiLang,
												slug: titleToSlug(post.title)
											},
											app.appData?.wikiLanguages || [],
											app.settings.wikiLang
										)
									)
								}
							>
								{thumb ? (
									<img
										src={commonsThumbUrl(thumb, 320)}
										alt=""
										loading="lazy"
									/>
								) : (
									<span
										className="accountVideoFallback"
										aria-hidden="true"
									>
										{group.emoji}
									</span>
								)}
								<span className="accountVideoTitle">{post.title}</span>
								{post.views ? (
									<span className="accountVideoViews">
										{formatCompactNumber(post.views)} views
									</span>
								) : null}
							</button>
						);
					})}
				</div>
			) : (
				<p className="accountEmpty">No shorts found for this account yet.</p>
			)}
		</section>
	);
}
