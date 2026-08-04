import { APP_VERSION } from "../lib/config";

export function AboutPage() {
	return (
		<section className="appPage" id="aboutPage" aria-labelledby="aboutTitle">
			<h2 id="aboutTitle">About</h2>
			<h3
				style={{
					fontSize: "100%",
					opacity: 0.85,
					fontStyle: "italic",
					marginBottom: 16
				}}
			>
				Wikipedia Shorts
			</h3>
			<p>
				<strong>Tikipedia</strong> is a short-form video feed of{" "}
				<a href="https://www.wikipedia.org/">Wikipedia</a> articles, fetched live
				in the language you choose. Swipe vertically, listen with your device’s
				text-to-speech, and read colorful word-by-word captions.
			</p>
			<br />
			<p style={{ marginTop: 0 }}>
				Recommendations run on your device from what you watch, like, and open. An
				internet connection is required to load new shorts.
			</p>
			<br />
			<p style={{ marginTop: 0 }}>
				Based on work by <a href="https://lyra.horse">rebane2001</a>. Source on{" "}
				<a href="https://github.com/rebane2001/xikipedia">GitHub</a>.
			</p>
			<p style={{ marginTop: 16, opacity: 0.7 }}>Version {APP_VERSION}</p>
		</section>
	);
}
