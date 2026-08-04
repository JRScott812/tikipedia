import { useEffect, useRef } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { DescriptionSheet } from "./components/DescriptionSheet";
import { FeedHeader } from "./components/FeedHeader";
import { Onboarding } from "./components/Onboarding";
import { PwaUpdateBanner } from "./components/PwaUpdateBanner";
import { TapToPlay } from "./components/TapToPlay";
import { useApp } from "./context/AppContext";
import { appPageDocumentTitle, FEED_DOCUMENT_TITLE } from "./lib/routes";
import { syncDocumentMeta } from "./lib/site";
import { AboutPage } from "./pages/AboutPage";
import { FollowingPage } from "./pages/FollowingPage";
import { ForYouPage } from "./pages/ForYouPage";
import { PostRoutePage } from "./pages/PostRoutePage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";

function pageFromPath(pathname: string): string {
	const rest = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
	const first = rest[0] || "";
	if (["profiles", "stats", "settings", "about", "following"].includes(first))
		return first;
	if (first === "p") return "foryou";
	return "foryou";
}

function Layout() {
	const location = useLocation();
	const app = useApp();
	const page = pageFromPath(location.pathname);

	const prevPage = useRef(page);
	const syncThemeColor = app.syncThemeColor;
	const setPaused = app.setPaused;
	const speechUnlocked = app.speechUnlocked;
	const activePostId = app.activePostId;
	const descOpen = !!app.desc;

	useEffect(() => {
		document.body.dataset.page = page;
		if (page !== "foryou") {
			syncDocumentMeta({
				title: appPageDocumentTitle(page),
				path: location.pathname
			});
		} else if (!activePostId) {
			syncDocumentMeta({
				title: FEED_DOCUMENT_TITLE,
				path: location.pathname
			});
		}
		syncThemeColor();

		// Pause when leaving foryou; resume when returning if unlocked.
		if (page !== "foryou" && prevPage.current === "foryou") {
			setPaused(true);
		} else if (
			page === "foryou" &&
			prevPage.current !== "foryou" &&
			speechUnlocked &&
			!descOpen
		) {
			setPaused(false);
		}
		prevPage.current = page;
	}, [
		page,
		location.pathname,
		syncThemeColor,
		setPaused,
		speechUnlocked,
		activePostId,
		descOpen
	]);
	// note: foryou + activePostId title/og sync is owned by ForYouPage

	if (!app.ready) {
		return (
			<div id="loading" role="status" aria-live="polite">
				{app.loadFailed ? (
					<>
						<p>{app.loadingText}</p>
						<button
							type="button"
							className="loadingRetry"
							onClick={app.retryBootstrap}
						>
							Retry
						</button>
					</>
				) : (
					<p>
						Loading...
						{"\n"}({app.loadingText})
					</p>
				)}
			</div>
		);
	}

	return (
		<>
			{/* Persistent theme radios so :root:has(#theme-*) CSS keeps working.
			    inert keeps them out of the a11y/focus tree (aria-hidden + focusable fails Lighthouse). */}
			<div className="sr-only" inert>
				<input
					type="radio"
					name="theme"
					id="theme-auto"
					tabIndex={-1}
					checked={app.settings.theme === "theme-auto"}
					onChange={() => app.updateSettings({ theme: "theme-auto" })}
				/>
				<input
					type="radio"
					name="theme"
					id="theme-light"
					tabIndex={-1}
					checked={app.settings.theme === "theme-light"}
					onChange={() => app.updateSettings({ theme: "theme-light" })}
				/>
				<input
					type="radio"
					name="theme"
					id="theme-dark"
					tabIndex={-1}
					checked={app.settings.theme === "theme-dark"}
					onChange={() => app.updateSettings({ theme: "theme-dark" })}
				/>
			</div>
			<Onboarding />
			<FeedHeader />
			<BottomNav />
			<TapToPlay />
			<DescriptionSheet />
			<PwaUpdateBanner />
			<main id="main" className="appMain">
				<Outlet />
			</main>
		</>
	);
}

export default function App() {
	return (
		<Routes>
			<Route element={<Layout />}>
				<Route index element={<ForYouPage />} />
				<Route path="following" element={<FollowingPage />} />
				<Route path="profiles" element={<ProfilesPage />} />
				<Route path="stats" element={<StatsPage />} />
				<Route path="settings" element={<SettingsPage />} />
				<Route path="about" element={<AboutPage />} />
				<Route path="p/:lang/:slug" element={<PostRoutePage />} />
				<Route path="p/:slug" element={<PostRoutePage />} />
				<Route path="*" element={<Navigate to="/" replace />} />
			</Route>
		</Routes>
	);
}
