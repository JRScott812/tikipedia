import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { convertCat } from "../lib/topics";
import { getArticleLink, getPageById } from "../lib/wiki";

function textTime(ms: number): string {
	const h = Math.floor(ms / 1000 / 3600);
	const m = Math.floor((ms / 1000 / 60) % 60);
	const s = Math.floor((ms / 1000) % 60);
	if (h) return `${h} hour${h === 1 ? "" : "s"}, ${m} minute${m === 1 ? "" : "s"}`;
	if (m) return `${m} minute${m === 1 ? "" : "s"}`;
	return `${s} second${s === 1 ? "" : "s"}`;
}

export function StatsPage() {
	const { engagement, settings } = useApp();
	const [topOpen, setTopOpen] = useState(false);
	const [bottomOpen, setBottomOpen] = useState(false);
	const [likedOpen, setLikedOpen] = useState(false);
	const [dislikedOpen, setDislikedOpen] = useState(false);

	const sorted = useMemo(
		() =>
			Object.entries(engagement.categoryScores)
				.filter(([, v]) => v)
				.sort((a, b) => b[1]! - a[1]!),
		[engagement.categoryScores]
	);

	const top100 = sorted.slice(0, 100);
	const bottom100 = sorted.slice(Math.max(0, sorted.length - 100)).reverse();

	return (
		<section className="appPage" id="statsPage" aria-labelledby="statsTitle">
			<h2 id="statsTitle">Statistics</h2>
			<p id="generalStats">
				{`Shorts watched (total): ${engagement.seenPosts.length}
Shorts watched (session): ${engagement.seenPosts.length - engagement.likesLen}
Time watching (total): ${textTime(engagement.timeSpentTotal)}
Time watching (session): ${textTime(engagement.timeSpentSession)}`}
			</p>
			<details
				open={topOpen}
				onToggle={(e) => setTopOpen((e.target as HTMLDetailsElement).open)}
			>
				<summary>Top categories</summary>
				<div id="top100">
					{topOpen ? (
						<ul>
							{top100.map(([k, v]) => (
								<li key={k}>
									{convertCat(k)}: {v}
								</li>
							))}
						</ul>
					) : null}
				</div>
			</details>
			<details
				open={bottomOpen}
				onToggle={(e) => setBottomOpen((e.target as HTMLDetailsElement).open)}
			>
				<summary>Bottom categories</summary>
				<div id="bottom100">
					{bottomOpen ? (
						<ul>
							{bottom100.map(([k, v]) => (
								<li key={k}>
									{convertCat(k)}: {v}
								</li>
							))}
						</ul>
					) : null}
				</div>
			</details>
			<details
				open={likedOpen}
				onToggle={(e) => setLikedOpen((e.target as HTMLDetailsElement).open)}
			>
				<summary>Liked shorts</summary>
				<div id="likedPosts">
					{likedOpen
						? engagement.likedPosts.map((id) => {
								const post = getPageById(id);
								return post ? (
									<a
										key={id}
										className="likedPostEntry"
										href={getArticleLink(post.title, settings)}
									>
										{post.title}
									</a>
								) : (
									<em key={id} className="likedPostEntry">
										Unknown post (id: {id})
									</em>
								);
							})
						: null}
				</div>
			</details>
			<details
				open={dislikedOpen}
				onToggle={(e) => setDislikedOpen((e.target as HTMLDetailsElement).open)}
			>
				<summary>Disliked shorts</summary>
				<div id="dislikedPosts">
					{dislikedOpen
						? engagement.dislikedPosts.map((id) => {
								const post = getPageById(id);
								return post ? (
									<a
										key={id}
										className="likedPostEntry"
										href={getArticleLink(post.title, settings)}
									>
										{post.title}
									</a>
								) : (
									<em key={id} className="likedPostEntry">
										Unknown post (id: {id})
									</em>
								);
							})
						: null}
				</div>
			</details>
		</section>
	);
}
