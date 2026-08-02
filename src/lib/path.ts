/**
 * Deploy-subdir-safe base path.
 * Prefer Vite's `import.meta.env.BASE_URL` (always correct after build).
 */
function resolveBasePath(): string {
	const fromVite = import.meta.env.BASE_URL || "/";
	if (fromVite) {
		return fromVite.endsWith("/") ? fromVite : `${fromVite}/`;
	}
	if (typeof document !== "undefined") {
		try {
			const path = new URL(".", document.baseURI).pathname;
			return path.endsWith("/") ? path : `${path}/`;
		} catch {
			/* ignore */
		}
	}
	return "/";
}

export const BASE_PATH = resolveBasePath();

/** Resolve a path relative to the app base. */
export function basePath(path: string): string {
	const cleaned = String(path || "").replace(/^\/+/, "");
	return `${BASE_PATH}${cleaned}`;
}

/** URL for a bundled icon in `public/icons/{name}.svg`. */
export function iconUrl(name: string): string {
	return basePath(`icons/${name}.svg`);
}
