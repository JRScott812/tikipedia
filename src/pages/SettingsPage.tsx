import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { clampCaptionSize, clampCaptionStroke, getWikiLangInfo } from "../lib/profile";
import { voiceMatchesWiki } from "../lib/speech";

export function SettingsPage() {
	const app = useApp();
	const navigate = useNavigate();
	const { settings, updateSettings, voices, appData } = app;
	const langInfo = getWikiLangInfo(appData?.wikiLanguages || [], settings.wikiLang);
	const bcp47 = langInfo?.bcp47 || "en";

	const sortedVoices = [...voices].sort((a, b) => {
		const aMatch = voiceMatchesWiki(a, bcp47) ? 0 : 1;
		const bMatch = voiceMatchesWiki(b, bcp47) ? 0 : 1;
		if (aMatch !== bMatch) return aMatch - bMatch;
		return (a.name || "").localeCompare(b.name || "");
	});

	const roles = Object.keys(appData?.capRoleLabels || {});

	return (
		<section className="appPage" id="settingsPage" aria-labelledby="settingsTitle">
			<h2 id="settingsTitle">Settings</h2>
			<label>
				Save my feed
				<input
					id="setting-storeData"
					type="checkbox"
					checked={settings.storeData}
					onChange={(e) => updateSettings({ storeData: e.target.checked })}
				/>
			</label>
			<p>
				Keep likes, watch history, and recommendations on this device. Turn off to
				start fresh every visit. Preferences stay local; article text is fetched
				from Wikipedia.
			</p>
			<pseudo-label>
				Wikipedia language
				<select
					id="setting-wikiLang"
					aria-label="Wikipedia language"
					value={settings.wikiLang}
					onChange={(e) => void app.changeWikiLang(e.target.value)}
				>
					{(appData?.wikiLanguages || []).map((lang) => (
						<option key={lang.code} value={lang.code}>
							{lang.label} ({lang.code})
						</option>
					))}
				</select>
			</pseudo-label>
			<p>
				Shorts are fetched live from this language edition. Recommendations are
				remembered separately per language.
			</p>
			<label>
				Open full articles in English Wikipedia
				<input
					id="setting-openMainWiki"
					type="checkbox"
					checked={settings.openMainWiki}
					onChange={(e) => updateSettings({ openMainWiki: e.target.checked })}
				/>
			</label>
			<p>
				When you open the full article, use English Wikipedia instead of the
				selected language edition.
			</p>
			<pseudo-label>
				Narrator voice
				<select
					id="setting-voice"
					aria-label="Text-to-speech voice"
					data-ready={voices.length ? "1" : undefined}
					value={settings.voiceURI}
					onChange={(e) =>
						updateSettings({
							voiceURI: e.target.value,
							voiceAutoMatched: false
						})
					}
				>
					<option value="">Default system voice</option>
					{sortedVoices.map((voice) => (
						<option key={voice.voiceURI} value={voice.voiceURI}>
							{voice.name} ({voice.lang}){voice.default ? " — default" : ""}
							{voiceMatchesWiki(voice, bcp47) ? " ★" : ""}
						</option>
					))}
				</select>
			</pseudo-label>
			<p id="voiceLangNote" hidden={!app.voiceNote}>
				{app.voiceNote}
			</p>
			<p>
				Pick a voice from your browser or OS. Changing language auto-selects a
				matching voice when one is installed.
			</p>
			<pseudo-label>
				Narration speed
				<input
					id="setting-speechRate"
					type="range"
					min={0.7}
					max={1.4}
					step={0.1}
					value={settings.speechRate}
					aria-label="Speech rate"
					onChange={(e) =>
						updateSettings({ speechRate: Number(e.target.value) || 1 })
					}
				/>
				<span id="speechRateLabel">
					{Number(settings.speechRate).toFixed(1)}x
				</span>
			</pseudo-label>
			<p>
				Everyday playback speed. Press and hold a short for a temporary 2x boost.
			</p>
			<button
				type="button"
				className="btn-outline"
				id="previewVoiceBtn"
				style={{ marginBottom: 8 }}
				onClick={app.previewVoice}
			>
				Preview voice
			</button>
			<h3 className="settingsSubhead">Captions</h3>
			<pseudo-label>
				Caption size
				<input
					id="setting-captionSize"
					type="range"
					min={0.7}
					max={1.5}
					step={0.1}
					value={settings.captionSize}
					aria-label="Caption size"
					onChange={(e) =>
						updateSettings({
							captionSize: clampCaptionSize(e.target.value)
						})
					}
				/>
				<span id="captionSizeLabel">
					{clampCaptionSize(settings.captionSize).toFixed(1)}×
				</span>
			</pseudo-label>
			<p>How large the karaoke words appear on each short.</p>
			<pseudo-label>
				Outline thickness
				<input
					id="setting-captionStroke"
					type="range"
					min={0}
					max={5}
					step={0.5}
					value={settings.captionStroke}
					aria-label="Caption outline thickness"
					onChange={(e) =>
						updateSettings({
							captionStroke: clampCaptionStroke(e.target.value)
						})
					}
				/>
				<span id="captionStrokeLabel">
					{(() => {
						const s = clampCaptionStroke(settings.captionStroke);
						return Number.isInteger(s) ? `${s}px` : `${s.toFixed(1)}px`;
					})()}
				</span>
			</pseudo-label>
			<p>
				Thicker outlines show more type color; thinner keeps words closer to plain
				white.
			</p>
			<div
				className="captionPreview"
				id="captionPreview"
				aria-label="Caption preview"
			>
				<span
					className="captionPreviewWord"
					style={{ ["--cap-color" as string]: "#FFE566" }}
				>
					caption will look like this
				</span>
			</div>
			<ul className="colorKey" id="captionColorKey" aria-label="Caption color key">
				{roles.map((role) => (
					<li key={role} className="colorKeyItem">
						<span
							className="colorKeySwatch"
							style={{
								["--cap-color" as string]:
									appData?.capRoleColors[role] || ""
							}}
						>
							Aa
						</span>
						<span>{appData?.capRoleLabels[role]}</span>
					</li>
				))}
			</ul>
			<pseudo-label>
				Theme
				<radio-picker aria-label="Theme picker" role="radiogroup">
					{(
						[
							["theme-auto", "Auto"],
							["theme-light", "Light"],
							["theme-dark", "Dark"]
						] as const
					).map(([id, label]) => (
						<label key={id}>
							<input
								type="radio"
								name="theme-setting"
								checked={settings.theme === id}
								onChange={() => updateSettings({ theme: id })}
							/>
							{label}
						</label>
					))}
				</radio-picker>
			</pseudo-label>
			<div style={{ flex: 1 }} />
			<button
				type="button"
				className="btn-outline"
				style={{ marginBottom: 8 }}
				onClick={() => navigate("/about")}
			>
				About
			</button>
			<button
				type="button"
				className="btn-danger-outline"
				style={{ marginBottom: 8 }}
				onClick={app.resetAlgorithm}
			>
				Reset recommendations
			</button>
			<button type="button" className="btn-danger" onClick={app.resetEverything}>
				Delete all data
			</button>
		</section>
	);
}
