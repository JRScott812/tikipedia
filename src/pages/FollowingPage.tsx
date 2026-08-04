import { useMemo } from "react";
import { useApp } from "../context/AppContext";
import { getFollowedTopics } from "../lib/topics";

export function FollowingPage() {
	const { engagement, appData } = useApp();

	const sections = useMemo(() => {
		if (!appData) return [];
		const topics = getFollowedTopics(
			engagement.categoryScores,
			appData.topicGroups,
			appData.topicNoiseRe
		);
		if (!topics.length) return [];
		const maxScore = Math.max(...topics.map((t) => t.score), 1);
		const byGroup = new Map<string, typeof topics>();
		topics.forEach((topic) => {
			const list = byGroup.get(topic.group.id) || [];
			list.push(topic);
			byGroup.set(topic.group.id, list);
		});
		return appData.topicGroups
			.map((group) => {
				const items = byGroup.get(group.id) || [];
				if (!items.length) return null;
				const total = items.reduce((sum, t) => sum + t.score, 0);
				return { group, items, total, maxScore };
			})
			.filter((s): s is NonNullable<typeof s> => !!s)
			.sort((a, b) => b.total - a.total);
	}, [engagement.categoryScores, appData]);

	return (
		<section
			className="appPage appPage--feed"
			id="followingPage"
			aria-labelledby="followingTitle"
		>
			<div className="followingIntro">
				<span className="followingEyebrow">Your interests</span>
				<h1 id="followingTitle">Topics you follow</h1>
				<p>Grouped privately from the shorts you watch, like, and open.</p>
			</div>
			<div className="followingFeed" id="followingGrid">
				{sections.map((section) => (
					<section
						key={section.group.id}
						className="followingSection"
						style={{ ["--topic-accent" as string]: section.group.accent }}
					>
						<div className="followingSectionHead">
							<h2>
								<span className="topicIcon" aria-hidden="true">
									{section.group.emoji}
								</span>
								{section.group.label}
							</h2>
							<span className="followingSectionMeta">
								{section.items.length} topic
								{section.items.length === 1 ? "" : "s"}
							</span>
						</div>
						<div className="followingGrid">
							{section.items.slice(0, 8).map((topic, index) => {
								const strength = Math.max(
									8,
									Math.round((topic.score / section.maxScore) * 100)
								);
								return (
									<article
										key={topic.category}
										className="followingCard"
										style={{
											["--topic-strength" as string]: `${strength}%`,
											["--topic-accent" as string]:
												section.group.accent
										}}
									>
										<span className="followingRank">{index + 1}</span>
										<h3>{topic.label}</h3>
										<div
											className="followingMeter"
											role="meter"
											aria-label="Relative interest"
											aria-valuemin={0}
											aria-valuemax={100}
											aria-valuenow={strength}
										/>
									</article>
								);
							})}
						</div>
					</section>
				))}
			</div>
			<p
				className="followingEmpty"
				id="followingEmpty"
				hidden={sections.length > 0}
			>
				Watch and like a few shorts to start building your topics.
			</p>
		</section>
	);
}
