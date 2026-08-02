import { basePath } from "./path.js";

const PAGE_FRAGMENTS = [
	"following.html",
	"start-screen.html",
	"profiles.html",
	"stats.html",
	"settings.html",
	"about.html",
];

export async function loadPages() {
	const root = document.getElementById("pageRoot");
	if (!root) throw new Error("Missing #pageRoot mount");

	const results = await Promise.all(
		PAGE_FRAGMENTS.map(async (file) => {
			const url = basePath(`pages/${file}`);
			const res = await fetch(url, { cache: "no-store" });
			if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
			return res.text();
		}),
	);

	root.innerHTML = results.join("\n");
}
