const SW_VERSION = '2.0.34';

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		// Drop dump-era caches only. Shell uses network-first; wiping html here
		// caused empty-cache hard-refresh flicker/races.
		await caches.delete("smoldata");
		await self.clients.claim();
	})());
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	const filename = url.pathname.split("/").at(-1);
	// SPA deep links: /p/{lang}/Article_Title (and legacy /p/Title) + nav pages → app shell
	if (event.request.mode === "navigate" && /\/(p\/|profiles|stats|settings|about|following)/.test(url.pathname)) {
		return event.respondWith((async () => {
			const shell = new URL("index.html", self.registration.scope);
			try {
				const networkResponse = await fetch(shell, { cache: "no-store" });
				if (networkResponse.ok) {
					const cache = await caches.open("html");
					await cache.put(shell, networkResponse.clone());
					return networkResponse;
				}
			} catch { /* fall through to cache */ }
			const cached = await caches.match(shell) || await caches.match("./index.html");
			if (cached) return cached;
			return fetch(shell);
		})());
	}
	// Old clients may still request removed dump / PNG icons.
	if (filename.startsWith("smoldata.json"))
		return event.respondWith(new Response("Gone", { status: 410 }));
	// Legacy icon paths → root favicon.svg
	if (filename === "favicon.ico" || /^favicon-\d+\.png$/.test(filename) || url.pathname.endsWith("/icons/favicon.svg"))
		return event.respondWith(Response.redirect(new URL("favicon.svg", self.registration.scope).href, 302));
	if (filename == "clearHtml")
		return event.respondWith((async () => {
			await caches.delete("html");
			await caches.delete("smoldata");
			return new Response("cleared", {
				status: 200,
				headers: { "Content-Type": "text/plain" },
			});
		})());
	if (filename == "swVer")
		return event.respondWith((() => new Response(SW_VERSION, {
			status: 200,
			headers: { "Content-Type": "text/plain" },
		}))());
	// Shell assets + local JSON config. Article content comes live from Wikipedia.
	const SHELL_FILES = [
		"", "index.html", "404.html", "styles.css", "app.js", "app.webmanifest",
		"path.js", "dom.js", "config.js", "state.js", "wiki.js", "profile.js", "topics.js",
		"speech.js", "media.js", "feed.js", "routes.js", "ui.js", "load-pages.js",
		"following.html", "start-screen.html", "profiles.html", "stats.html", "settings.html", "about.html",
		"favicon.svg", "home.svg", "user.svg", "chart.svg", "settings.svg", "download.svg", "search.svg",
		"heart.svg", "heart-fill.svg", "dislike.svg", "share.svg", "volume.svg", "volume-mute.svg",
		"more.svg", "play.svg", "pause.svg", "fast-forward.svg",
		"version.json",
		"languages.json", "topics.json", "speech.json", "captions.json", "junk-images.json",
	];
	if (!SHELL_FILES.includes(filename))
		return;
	// Network-first so deploys aren't stuck behind a stale Cache Storage entry.
	event.respondWith((async () => {
		const request = event.request;
		const cache = await caches.open("html");
		try {
			const networkResponse = await fetch(request, { cache: "no-store" });
			if (networkResponse.ok)
				await cache.put(request, networkResponse.clone());
			return networkResponse;
		} catch (error) {
			const cachedResponse = await caches.match(request);
			if (cachedResponse) return cachedResponse;
			return new Response("Network error happened", {
				status: 408,
				headers: { "Content-Type": "text/plain" },
			});
		}
	})());
});
