import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AccountAvatar } from "../components/AccountAvatar";
import { useApp } from "../context/AppContext";
import {
	accountHandle,
	getFollowedAccounts,
	getSuggestedAccounts,
	rollUpAccountScores,
	type AccountRow
} from "../lib/accounts";
import { classifyTopicGroup } from "../lib/topics";

export function FollowingPage() {
	const { engagement, appData, settings, toggleFollowAccount } = useApp();
	const navigate = useNavigate();

	const topicGroups = useMemo(() => appData?.topicGroups || [], [appData]);

	const scoreById = useMemo(
		() =>
			rollUpAccountScores(engagement.categoryScores, (category) =>
				classifyTopicGroup(category, topicGroups)
			),
		[engagement.categoryScores, topicGroups]
	);

	const followed = useMemo(
		() => getFollowedAccounts(settings.followedAccounts, topicGroups, scoreById),
		[settings.followedAccounts, topicGroups, scoreById]
	);

	const suggested = useMemo(
		() =>
			getSuggestedAccounts(settings.followedAccounts, topicGroups, scoreById).slice(
				0,
				followed.length ? 6 : topicGroups.length
			),
		[settings.followedAccounts, topicGroups, scoreById, followed.length]
	);

	const renderRow = (row: AccountRow, key: string) => {
		const { group } = row;
		const following = settings.followedAccounts.includes(group.id);
		return (
			<div
				key={key}
				className="accountRow"
				style={{ ["--topic-accent" as string]: group.accent }}
			>
				<button
					type="button"
					className="accountRowMain"
					onClick={() => navigate(`/account/${group.id}`)}
					aria-label={`Open ${group.label} account`}
				>
					<AccountAvatar group={group} size={44} />
					<span className="accountRowInfo">
						<span className="accountHandle">{accountHandle(group)}</span>
						<span className="accountMeta">{group.label}</span>
					</span>
				</button>
				<button
					type="button"
					className="followBtn"
					data-following={following ? "1" : undefined}
					aria-pressed={following}
					onClick={(e) => {
						e.stopPropagation();
						toggleFollowAccount(group.id);
					}}
				>
					{following ? "Following" : "Follow"}
				</button>
			</div>
		);
	};

	return (
		<section
			className="appPage appPage--feed"
			id="followingPage"
			aria-labelledby="followingTitle"
		>
			<div className="followingIntro">
				<span className="followingEyebrow">Your accounts</span>
				<h1 id="followingTitle">Following</h1>
				<p>
					Every Wikipedia topic is an account posting shorts. Follow the ones
					you like.
				</p>
			</div>
			<div className="followingFeed" id="followingGrid">
				{followed.length ? (
					<section>
						<h2 className="accountSectionHead">
							Accounts you follow ({followed.length})
						</h2>
						<div className="accountList">
							{followed.map((row) => renderRow(row, `f-${row.group.id}`))}
						</div>
					</section>
				) : null}
				{suggested.length ? (
					<section>
						<h2 className="accountSectionHead">
							{followed.length ? "Suggested for you" : "Popular accounts"}
						</h2>
						<div className="accountList">
							{suggested.map((row) => renderRow(row, `s-${row.group.id}`))}
						</div>
					</section>
				) : null}
			</div>
			<p
				className="followingEmpty"
				id="followingEmpty"
				hidden={!!(followed.length || suggested.length)}
			>
				Watch a few shorts to see accounts to follow here.
			</p>
		</section>
	);
}
