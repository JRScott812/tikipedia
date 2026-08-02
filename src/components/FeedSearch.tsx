import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { iconUrl } from "../lib/path";
import { isWikiLangCode, slugToTitle } from "../lib/routes";
import type { WikiLang } from "../types/wiki";
import { wikiQuery } from "../lib/wiki";

function parseReelQuery(
	raw: string,
	wikiLanguages: WikiLang[]
): { title: string; lang: string | null } {
	let q = String(raw || "").trim();
	if (!q) return { title: "", lang: null };
	let langParam: string | null = null;
	try {
		if (/^https?:\/\//i.test(q)) {
			const url = new URL(q);
			langParam = url.searchParams.get("lang");
			q = url.pathname + url.search + url.hash;
		}
	} catch {
		/* keep raw */
	}

	const fromParts = (parts: string[]) => {
		const segs = (parts || []).filter(Boolean);
		if (!segs.length) return { title: "", lang: null };
		if (segs.length >= 2 && isWikiLangCode(segs[0], wikiLanguages))
			return {
				lang: segs[0]!.toLowerCase(),
				title: slugToTitle(segs.slice(1).join("/"))
			};
		return { lang: null, title: slugToTitle(segs[0]) };
	};

	const pathMatch = q.match(/\/p\/([^?#]+)/i) || q.match(/^p\/([^?#]+)/i);
	if (pathMatch) {
		const route = fromParts(pathMatch[1]!.split("/"));
		if (!route.lang && langParam && isWikiLangCode(langParam, wikiLanguages))
			route.lang = langParam.toLowerCase();
		return route;
	}

	if (/_/.test(q) && !/\s/.test(q) && !q.includes("/"))
		return { title: slugToTitle(q), lang: null };
	return { title: q.replace(/_/g, " ").trim(), lang: null };
}

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function FeedSearch({ open, onOpenChange }: Props) {
	const { appData, openPostByTitle, settings } = useApp();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<string[]>([]);
	const [status, setStatus] = useState("");
	const [activeIndex, setActiveIndex] = useState(-1);
	const inputRef = useRef<HTMLInputElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (open) {
			inputRef.current?.focus();
			inputRef.current?.select();
		} else {
			setResults([]);
			setStatus("");
			setActiveIndex(-1);
		}
	}, [open]);

	useEffect(() => {
		const onDocClick = (e: MouseEvent) => {
			if (!open) return;
			if (rootRef.current?.contains(e.target as Node)) return;
			onOpenChange(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && open) onOpenChange(false);
		};
		document.addEventListener("click", onDocClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("click", onDocClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open, onOpenChange]);

	const runSearch = async (searchText: string) => {
		const q = searchText.trim();
		if (q.length < 2) {
			setResults([]);
			setStatus("");
			return;
		}
		if (/\/p\//i.test(q) || /^p\//i.test(q) || /^https?:\/\//i.test(q)) {
			setResults([]);
			const parsed = parseReelQuery(q, appData?.wikiLanguages || []);
			const hint = parsed.lang ? ` (${parsed.lang})` : "";
			setStatus(`Press Enter to open${hint}.`);
			return;
		}
		setStatus("Searching…");
		try {
			const data = (await wikiQuery(
				{
					action: "opensearch",
					search: q,
					limit: 8,
					namespace: 0,
					redirects: "resolve"
				},
				{ useCache: false, settingsWikiLang: settings.wikiLang }
			)) as unknown[];
			const titles = (data?.[1] as string[]) || [];
			if (!titles.length) {
				setResults([]);
				setStatus("No articles found.");
				return;
			}
			setStatus("");
			setResults(titles);
			setActiveIndex(-1);
		} catch (err) {
			console.warn("article search failed", err);
			setStatus("Search failed. Check your connection.");
		}
	};

	const openTitle = async (title: string, lang?: string | null) => {
		setStatus(`Loading ${title}…`);
		navigate("/");
		const post = await openPostByTitle(title, lang);
		if (!post) {
			setStatus(`Couldn't find “${title}”. Try another title.`);
			return;
		}
		setQuery(title);
		onOpenChange(false);
	};

	return (
		<div className="feedSearch" ref={rootRef}>
			<button
				type="button"
				className="feedSearchToggle"
				aria-label="Search articles"
				aria-expanded={open}
				aria-controls="feedSearchPanel"
				onClick={(e) => {
					e.stopPropagation();
					onOpenChange(!open);
				}}
			>
				<img
					className="feedSearchIcon"
					src={iconUrl("search")}
					alt=""
					width={22}
					height={22}
				/>
			</button>
			<form
				id="feedSearchPanel"
				className="feedSearchPanel"
				role="search"
				hidden={!open}
				onClick={(e) => e.stopPropagation()}
				onSubmit={(e) => {
					e.preventDefault();
					if (activeIndex >= 0 && results[activeIndex]) {
						void openTitle(results[activeIndex]!);
						return;
					}
					const parsed = parseReelQuery(query, appData?.wikiLanguages || []);
					if (!parsed.title) {
						setStatus("Type an article title or paste a /p/lang/Title URL.");
						return;
					}
					void openTitle(parsed.title, parsed.lang);
				}}
			>
				<label className="sr-only" htmlFor="feedSearchInput">
					Search Wikipedia articles
				</label>
				<input
					ref={inputRef}
					id="feedSearchInput"
					className="feedSearchInput"
					type="search"
					name="q"
					role="combobox"
					aria-autocomplete="list"
					aria-controls="feedSearchResults"
					aria-expanded={results.length > 0}
					aria-activedescendant={
						activeIndex >= 0 ? `feedSearchOpt-${activeIndex}` : undefined
					}
					placeholder="Search or paste /p/en/Title…"
					autoComplete="off"
					enterKeyHint="search"
					value={query}
					onChange={(e) => {
						const v = e.target.value;
						setQuery(v);
						if (debounceRef.current) clearTimeout(debounceRef.current);
						debounceRef.current = setTimeout(() => void runSearch(v), 250);
					}}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							e.preventDefault();
							onOpenChange(false);
							return;
						}
						if (!results.length) return;
						if (e.key === "ArrowDown") {
							e.preventDefault();
							setActiveIndex((i) => (i + 1) % results.length);
						} else if (e.key === "ArrowUp") {
							e.preventDefault();
							setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
						}
					}}
				/>
				<ul
					id="feedSearchResults"
					className="feedSearchResults"
					role="listbox"
					hidden={!results.length}
				>
					{results.map((title, i) => (
						<li
							key={title}
							role="option"
							id={`feedSearchOpt-${i}`}
							aria-selected={i === activeIndex}
						>
							<button
								type="button"
								className="feedSearchResult"
								tabIndex={-1}
								onClick={() => void openTitle(title)}
							>
								{title}
							</button>
						</li>
					))}
				</ul>
				<p
					id="feedSearchStatus"
					className="feedSearchStatus"
					role="status"
					aria-live="polite"
					hidden={!status}
				>
					{status}
				</p>
			</form>
		</div>
	);
}
