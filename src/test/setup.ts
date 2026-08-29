import "@testing-library/jest-dom/vitest";

// Node 26+ exposes a built-in `localStorage` that is `undefined` when
// `--localstorage-file` is not passed, which breaks tests that expect the
// Web Storage API. Provide a reliable in-memory implementation so all test
// environments have a working localStorage regardless of Node version.
if (typeof localStorage === "undefined" || localStorage === null) {
	const store: Record<string, string> = {};
	Object.defineProperty(globalThis, "localStorage", {
		value: {
			getItem: (k: string) => store[k] ?? null,
			setItem: (k: string, v: string) => {
				store[k] = String(v);
			},
			removeItem: (k: string) => {
				delete store[k];
			},
			clear: () => {
				for (const k of Object.keys(store)) delete store[k];
			},
			get length() {
				return Object.keys(store).length;
			},
			key: (i: number) => Object.keys(store)[i] ?? null
		} satisfies Storage,
		writable: true
	});
}
