import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { isWikiLangCode, slugToTitle } from "../lib/routes";
import { ForYouPage } from "./ForYouPage";

/** Deep link `/p/:lang/:slug` or `/p/:slug` — open post then show feed. */
export function PostRoutePage() {
	const { lang, slug } = useParams();
	const app = useApp();
	const navigate = useNavigate();
	const opened = useRef(false);

	useEffect(() => {
		if (!app.ready || !app.onboardingDone || opened.current) return;
		const langs = app.appData?.wikiLanguages || [];
		let routeLang: string | null = null;
		let routeSlug = "";
		if (lang && slug && isWikiLangCode(lang, langs)) {
			routeLang = lang;
			routeSlug = slug;
		} else if (lang && !slug) {
			routeSlug = lang;
		} else if (lang && slug) {
			routeSlug = `${lang}/${slug}`;
		}
		const title = slugToTitle(routeSlug);
		if (!title) {
			navigate("/", { replace: true });
			return;
		}
		const existing = app.posts.find(
			(p) => p.title.toLowerCase() === title.toLowerCase()
		);
		if (existing) {
			opened.current = true;
			app.setActivePostId(existing.id);
			return;
		}
		opened.current = true;
		void (async () => {
			const post = await app.openPostByTitle(title, routeLang);
			if (!post) navigate("/", { replace: true });
		})();
	}, [app, lang, slug, navigate]);

	return <ForYouPage />;
}
