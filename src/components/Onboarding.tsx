import { useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { basePath } from "../lib/path";
import { wikiQuery } from "../lib/wiki";

export function Onboarding() {
	const { appData, completeOnboarding, settings, onboardingDone, ready } = useApp();
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [search, setSearch] = useState("");
	const [results, setResults] = useState<string[]>([]);
	const [extra, setExtra] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);

	const defaults = appData?.defaultCategories || [];
	const allCats = [...defaults, ...extra.filter((c) => !defaults.includes(c))];

	useEffect(() => {
		const el = popoverRef.current;
		if (!el || onboardingDone || !ready) return;
		try {
			el.showPopover?.();
		} catch {
			/* ignore */
		}
	}, [onboardingDone, ready]);

	if (!ready || onboardingDone) return null;

	const toggle = (cat: string) => {
		setPicked((prev) => {
			const next = new Set(prev);
			if (next.has(cat)) next.delete(cat);
			else next.add(cat);
			return next;
		});
	};

	const addCategory = (cat: string) => {
		const key = cat.trim();
		if (!key) return;
		if (!extra.includes(key) && !defaults.includes(key)) setExtra((e) => [...e, key]);
		setPicked((prev) => new Set(prev).add(key));
		setResults([]);
		setSearch("");
	};

	return (
		<div id="startScreen" popover="manual" ref={popoverRef}>
			<div className="startHero">
				<img
					className="startLogo"
					src={basePath("favicon.svg")}
					alt=""
					width={72}
					height={72}
				/>
				<h1>Tikipedia</h1>
				<p className="startTagline">Wikipedia, as short videos</p>
			</div>
			<p className="startLead">
				Swipe narrated Wikipedia shorts with word-by-word captions.
				Recommendations stay on your device.
			</p>
			<p className="startMeta">
				Live from Wikimedia · based on work by{" "}
				<a href="https://lyra.horse">rebane2001</a>
			</p>
			<p className="startMeta" id="iosmessage" hidden={!isIos}>
				iOS tip: if narration feels flaky, try Safari desktop mode.
			</p>
			<section className="startSection">
				<h2>
					Pick topics <span>optional</span>
				</h2>
				<div id="categoryPickList">
					{allCats.map((cat) => (
						<label key={cat} className="categoryPicker">
							{cat.slice(0, 1).toUpperCase() + cat.slice(1)}
							<input
								type="checkbox"
								data-category={cat}
								checked={picked.has(cat)}
								onChange={() => toggle(cat)}
							/>
						</label>
					))}
				</div>
			</section>
			<section className="startSection">
				<h2>Or search your own</h2>
				<div id="categorySearch">
					<label className="sr-only" htmlFor="onboardingSearch">
						Search Wikipedia topics
					</label>
					<input
						id="onboardingSearch"
						placeholder="Search Wikipedia…"
						autoComplete="off"
						value={search}
						onChange={(e) => {
							const v = e.target.value;
							setSearch(v);
							if (debounceRef.current) clearTimeout(debounceRef.current);
							debounceRef.current = setTimeout(async () => {
								const q = v.trim();
								if (!q) {
									setResults([]);
									return;
								}
								try {
									const data = (await wikiQuery(
										{
											action: "opensearch",
											search: q,
											limit: 20,
											namespace: 0,
											redirects: "resolve"
										},
										{
											useCache: false,
											settingsWikiLang: settings.wikiLang
										}
									)) as unknown[];
									setResults((data?.[1] as string[]) || []);
								} catch {
									setResults([]);
								}
							}, 250);
						}}
					/>
					<select
						size={5}
						aria-label="Search results"
						value=""
						onChange={(e) => {
							if (e.target.value) addCategory(e.target.value);
						}}
					>
						{results.map((t) => (
							<option key={t} value={t}>
								{t}
							</option>
						))}
					</select>
				</div>
			</section>
			<div className="startFooter">
				<p className="startWarning">
					Wikipedia can include NSFW pages. Continue only if you’re an adult.
				</p>
				<button
					id="startBtn"
					type="button"
					disabled={busy}
					data-ready="1"
					onClick={async () => {
						setBusy(true);
						await completeOnboarding([...picked]);
						try {
							popoverRef.current?.hidePopover?.();
						} catch {
							/* ignore */
						}
					}}
				>
					Continue
				</button>
			</div>
		</div>
	);
}
