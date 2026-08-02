const SW_VERSION = '2.0.10';

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		// Drop dump-era caches left over from older builds.
		await caches.delete("smoldata");
		await self.clients.claim();
	})());
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	const filename = url.pathname.split("/").at(-1);
	// SPA deep links: /p/Article_Title and nav pages → app shell
	if (event.request.mode === "navigate" && /\/(p\/|profiles|stats|settings|about|following)/.test(url.pathname)) {
		return event.respondWith((async () => {
			const shell = new URL("index.html", self.registration.scope);
			const cached = await caches.match(shell) || await caches.match("./index.html");
			if (cached) return cached;
			return fetch(shell);
		})());
	}
	// Old clients may still request removed dump / PNG icons.
	if (filename.startsWith("smoldata.json"))
		return event.respondWith(new Response("Gone", { status: 410 }));
	if (filename === "favicon.ico" || /^favicon-\d+\.png$/.test(filename))
		return event.respondWith(Response.redirect(new URL("favicon.svg", event.request.url).href, 302));
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
		"speech.js", "media.js", "feed.js", "routes.js", "ui.js",
		"favicon.svg", "version.json",
		"languages.json", "topics.json", "speech.json", "captions.json", "junk-images.json",
	];
	if (!SHELL_FILES.includes(filename))
		return;
	event.respondWith((async () => {
		const request = event.request;
		const cachedResponse = await caches.match(request);
		if (cachedResponse)
			return cachedResponse;
		const cache = await caches.open("html");
		try {
			const networkResponse = await fetch(request);
			if (!networkResponse.ok)
				return networkResponse;
			await cache.put(request, networkResponse.clone());
			return networkResponse;
		} catch (error) {
			return new Response("Network error happened", {
				status: 408,
				headers: { "Content-Type": "text/plain" },
			});
		}
	})());
});
