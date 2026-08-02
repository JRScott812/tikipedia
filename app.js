import { state } from "./js/state.js";
import "./js/path.js";
import { loadPages } from "./js/load-pages.js";

await loadPages();

await import("./js/dom.js");
await import("./js/config.js");
await import("./js/profile.js");
await import("./js/wiki.js");
await import("./js/speech.js");
await import("./js/topics.js");
await import("./js/media.js");
await import("./js/feed.js");
await import("./js/routes.js");
await import("./js/ui.js");

// Keep the inline HTML handlers working while implementation stays modular.
for (const name of [
	"showForYouPage", "showFollowingPage",
	"showProfilesPage", "showStatsPage", "showSettingsPage", "showAboutPage",
	"showProfilesModal", "showStatsModal", "showSettingsModal", "showAboutModal",
	"resetAlgorithm", "resetEverything", "updateTopStats", "updateLikeStats",
]) window[name] = (...args) => state[name](...args);

Object.defineProperty(window, "activePostEl", { configurable: true, get: () => state.activePostEl });

await state.bootstrap();
