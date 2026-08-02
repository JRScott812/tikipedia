import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { FeedSearch } from "./FeedSearch";

export function FeedHeader() {
	const location = useLocation();
	const [searchOpen, setSearchOpen] = useState(false);
	const segments = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
	const first = segments[0] || "";
	const showHeader =
		first === "" ||
		first === "following" ||
		first === "p" ||
		location.pathname === "/";

	if (!showHeader) return null;

	const onForYou = first === "" || first === "p" || location.pathname === "/";

	return (
		<header
			className={`feedHeader${searchOpen ? " feedHeader--searchOpen" : ""}`}
			aria-label="Feed"
		>
			<span className="feedBrand" role="img" aria-label="Tikipedia" />
			<div className="feedTabs" role="navigation" aria-label="Current feed">
				<NavLink
					to="/following"
					className={({ isActive }) =>
						`feedTab followingTab${isActive ? " active" : ""}`
					}
				>
					Following
				</NavLink>
				<NavLink
					to="/"
					end
					className={() => `feedTab forYouTab${onForYou ? " active" : ""}`}
					aria-current={onForYou ? "page" : undefined}
				>
					For You
				</NavLink>
			</div>
			<FeedSearch open={searchOpen} onOpenChange={setSearchOpen} />
		</header>
	);
}
