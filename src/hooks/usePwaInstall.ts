import { useEffect, useState } from "react";
import { BASE_PATH } from "../lib/path";

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwaInstall() {
	const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
	const [visible, setVisible] = useState(false);
	const [hint, setHint] = useState<string | null>(null);

	useEffect(() => {
		const standalone =
			window.matchMedia("(display-mode: standalone)").matches ||
			("standalone" in navigator &&
				Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
		if (standalone) return;

		if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
			setVisible(true);
			setHint(
				"To install Tikipedia on iOS, open this site in Safari, tap Share, then Add to Home Screen."
			);
			return;
		}

		if (!("chrome" in window)) {
			setVisible(true);
			setHint(
				"To install Tikipedia, open it in Chrome or check how your browser installs PWAs."
			);
		}

		const onPrompt = (event: Event) => {
			event.preventDefault();
			setPromptEvent(event as BeforeInstallPromptEvent);
			setVisible(true);
			setHint(null);
		};
		window.addEventListener("beforeinstallprompt", onPrompt);
		return () => window.removeEventListener("beforeinstallprompt", onPrompt);
	}, []);

	const install = async () => {
		if (hint) {
			alert(hint);
			return;
		}
		if (!promptEvent) {
			setVisible(false);
			return;
		}
		try {
			await (await fetch(BASE_PATH)).text();
		} catch {
			/* ignore */
		}
		await promptEvent.prompt();
		setPromptEvent(null);
		setVisible(false);
	};

	return { visible, install };
}
