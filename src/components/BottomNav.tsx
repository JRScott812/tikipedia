import { useLocation, useNavigate } from "react-router-dom";
import { basePath } from "../lib/path";
import { Icon } from "./Icon";
import { InstallButton } from "./InstallButton";

export function BottomNav() {
	const location = useLocation();
	const navigate = useNavigate();
	const page = (() => {
		const rest = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
		const first = rest[0] || "";
		if (["profiles", "stats", "settings", "about", "following"].includes(first))
			return first;
		return "home";
	})();

	const navBtn = (
		key: string,
		path: string,
		icon: string,
		label: string,
		active: boolean
	) => (
		<button
			type="button"
			key={key}
			data-nav={key}
			className={active ? "active" : undefined}
			aria-current={active ? "page" : undefined}
			onClick={() => navigate(path)}
		>
			<Icon className="navIcon" name={icon} size={25} />
			{label}
		</button>
	);

	return (
		<nav className="bottomNav" aria-label="Main">
			<a href={basePath("")} aria-label="Tikipedia home">
				<img
					className="logo"
					src={basePath("favicon.svg")}
					alt="Tikipedia"
					width={32}
					height={32}
				/>
			</a>
			<button
				type="button"
				className={`homeNav${page === "home" || page === "following" ? " active" : ""}`}
				data-nav="home"
				aria-current={
					page === "home" || page === "following" ? "page" : undefined
				}
				onClick={() => {
					navigate("/");
					document
						.querySelector(".post[data-active]")
						?.scrollIntoView({ behavior: "smooth" });
				}}
			>
				<Icon className="navIcon" name="home" size={25} />
				Home
			</button>
			{navBtn("profiles", "/profiles", "user", "Profiles", page === "profiles")}
			{navBtn("stats", "/stats", "chart", "Stats", page === "stats")}
			{navBtn(
				"settings",
				"/settings",
				"settings",
				"Settings",
				page === "settings" || page === "about"
			)}
			<InstallButton />
		</nav>
	);
}
