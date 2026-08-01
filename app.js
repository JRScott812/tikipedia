import { state } from "./js/state.js";
import "./js/path.js";
import "./js/dom.js";
import "./js/config.js";
import "./js/profile.js";
import "./js/wiki.js";
import "./js/speech.js";
import "./js/topics.js";
import "./js/media.js";
import "./js/feed.js";
import "./js/routes.js";
import "./js/ui.js";

// Keep the inline HTML handlers working while implementation stays modular.
for (const name of [
	"showForYouPage", "showFollowingPage",
	"showProfilesPage", "showStatsPage", "showSettingsPage", "showAboutPage",
	"showProfilesModal", "showStatsModal", "showSettingsModal", "showAboutModal",
	"resetAlgorithm", "resetEverything", "updateTopStats", "updateLikeStats",
]) window[name] = (...args) => state[name](...args);

Object.defineProperty(window, "activePostEl", { configurable: true, get: () => state.activePostEl });

await state.bootstrap();
