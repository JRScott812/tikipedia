import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { fetchTopicIcon } from "../lib/topicIcon";
import type { TopicGroup } from "../types/wiki";

/**
 * Account profile picture for a topic-group "account". Shows that topic's
 * own Wikipedia page image (e.g. the "Film" article's photo for Film & TV)
 * on an accent-colored background; falls back to the topic's emoji if no
 * wiki image is available. Never shows the Tikipedia/Wikipedia app logo.
 */
export function AccountAvatar({
	group,
	size = 44,
	className
}: {
	group: Pick<TopicGroup, "emoji" | "accent" | "label" | "wikiPage">;
	size?: number;
	className?: string;
}) {
	const app = useApp();
	const [icon, setIcon] = useState<string | null>(null);

	useEffect(() => {
		setIcon(null);
		let cancelled = false;
		void fetchTopicIcon(group.wikiPage, app.settings.wikiLang).then((src) => {
			if (!cancelled) setIcon(src);
		});
		return () => {
			cancelled = true;
		};
	}, [group.wikiPage, app.settings.wikiLang]);

	return (
		<div
			className={`accountAvatar${className ? ` ${className}` : ""}`}
			style={{
				width: size,
				height: size,
				["--avatar-accent" as string]: group.accent
			}}
			role="img"
			aria-label={`${group.label} account`}
		>
			{icon ? (
				<img src={icon} alt="" draggable={false} onError={() => setIcon(null)} />
			) : (
				<span className="accountAvatarEmoji" aria-hidden="true">
					{group.emoji}
				</span>
			)}
		</div>
	);
}
