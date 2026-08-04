import { useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { getWikiLangInfo } from "../lib/profile";
import { createSpeechController, type SpeechController } from "../lib/speech";
import type { Post } from "../types/wiki";

type Options = {
	post: Post | null;
	postEl: HTMLElement | null;
	enabled: boolean;
	getLinkImageRemainingMs?: () => number;
	onCaptionWord?: (word: HTMLElement | null, words: HTMLElement[]) => void;
	onLoop?: () => void;
};

export function useSpeechPlayback({
	post,
	postEl,
	enabled,
	getLinkImageRemainingMs,
	onCaptionWord,
	onLoop
}: Options) {
	const app = useApp();
	const appRef = useRef(app);
	appRef.current = app;

	const controllerRef = useRef<SpeechController | null>(null);
	const onCaptionWordRef = useRef(onCaptionWord);
	const onLoopRef = useRef(onLoop);
	const getLinkMsRef = useRef(getLinkImageRemainingMs);
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;

	const spokenText = post ? app.getSpokenText(post) : "";
	const sectionKey =
		post && app.sectionPlayback && app.sectionPlayback.postId === post.id
			? `${app.sectionPlayback.sectionIndex}:${app.sectionPlayback.text}`
			: `0:${spokenText}`;

	useEffect(() => {
		onCaptionWordRef.current = onCaptionWord;
	}, [onCaptionWord]);
	useEffect(() => {
		onLoopRef.current = onLoop;
	}, [onLoop]);
	useEffect(() => {
		getLinkMsRef.current = getLinkImageRemainingMs;
	}, [getLinkImageRemainingMs]);

	if (!controllerRef.current) {
		controllerRef.current = createSpeechController({
			onCaptionIndex: (index, word, words) => {
				appRef.current.setCaptionIndex(index);
				onCaptionWordRef.current?.(word, words);
			},
			getRate: () => appRef.current.playbackRate,
			getMuted: () => appRef.current.settings.muted,
			getVoiceURI: () => appRef.current.settings.voiceURI,
			getSpeechRate: () => appRef.current.settings.speechRate,
			getLangInfo: () => {
				const a = appRef.current;
				const info = getWikiLangInfo(
					a.appData?.wikiLanguages || [],
					a.settings.wikiLang
				);
				return info || { bcp47: "en", code: "simple" };
			},
			isSpeechUnlocked: () => appRef.current.speechUnlocked,
			onNeedUnlock: () => appRef.current.setShowTapToPlay(true),
			canLoop: () => enabledRef.current && !appRef.current.playbackPaused,
			onLoop: () => onLoopRef.current?.(),
			getLinkImageRemainingMs: () => getLinkMsRef.current?.() || 0,
			getVoices: () => appRef.current.voices,
			get roleColors() {
				return appRef.current.appData?.capRoleColors;
			},
			get speechData() {
				const d = appRef.current.appData;
				if (!d) return undefined;
				return {
					monthNamesEn: d.monthNamesEn,
					ordinalWords: d.ordinalWords,
					ones: d.ones,
					teens: d.teens,
					tens: d.tens,
					rangeConnectors: d.rangeConnectors,
					capRoleColors: d.capRoleColors
				};
			}
		});
	}

	const controller = controllerRef.current;
	const prevSectionKeyRef = useRef(sectionKey);

	useEffect(() => {
		if (!enabled || !post || !postEl) {
			controller.stopPlayback();
			return;
		}
		const sectionChanged = prevSectionKeyRef.current !== sectionKey;
		prevSectionKeyRef.current = sectionKey;

		if (sectionChanged) {
			// Drop any in-flight utterance so unpause starts the new section from 0.
			controller.stopPlayback();
		}

		if (app.playbackPaused) {
			controller.pause();
			return;
		}
		const words = [...postEl.querySelectorAll<HTMLElement>(".caption-word")];
		if (!words.length) return;
		if (sectionChanged) {
			controller.speakFrom(words, spokenText, 0);
		} else if (controller.isPaused()) {
			controller.resume(words, spokenText);
		} else {
			controller.speakFrom(words, spokenText, app.captionIndex);
		}
		// Only re-speak when post/section/mute/rate/unlock/pause change — not every caption tick.
		// eslint-disable-next-line react-hooks/exhaustive-deps -- captionIndex intentionally omitted
	}, [
		enabled,
		post?.id,
		postEl,
		sectionKey,
		spokenText,
		app.playbackPaused,
		app.settings.muted,
		app.playbackRate,
		app.speechUnlocked,
		app.settings.voiceURI,
		app.settings.speechRate,
		controller
	]);

	useEffect(() => {
		return () => {
			controller.stopPlayback();
		};
	}, [controller]);

	return {
		controller,
		speakFrom: (startIndex = 0) => {
			if (!post || !postEl) return;
			const words = [...postEl.querySelectorAll<HTMLElement>(".caption-word")];
			const text = appRef.current.getSpokenText(post);
			controller.speakFrom(words, text, startIndex);
		},
		seek: (index: number, resume = true) => {
			if (!post || !postEl) return 0;
			const words = [...postEl.querySelectorAll<HTMLElement>(".caption-word")];
			const text = appRef.current.getSpokenText(post);
			return controller.seek(words, text, index, { resume });
		},
		previewSeek: (index: number) => {
			if (!postEl) return 0;
			const words = [...postEl.querySelectorAll<HTMLElement>(".caption-word")];
			return controller.previewSeek(words, index);
		},
		restartFromCurrent: () => {
			if (!post || !postEl || app.playbackPaused) return;
			const words = [...postEl.querySelectorAll<HTMLElement>(".caption-word")];
			const text = appRef.current.getSpokenText(post);
			controller.restartFromCurrent(words, text);
		}
	};
}
