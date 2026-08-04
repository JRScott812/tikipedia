import { useApp } from "../context/AppContext";
import { Icon } from "./Icon";

export function TapToPlay() {
	const { showTapToPlay, unlockSpeech } = useApp();
	if (!showTapToPlay) return null;
	return (
		<button
			type="button"
			id="tapToPlay"
			aria-label="Tap to play audio"
			data-show=""
			onClick={() => unlockSpeech()}
		>
			<span>
				<Icon className="tapPlayIcon" name="play" size={22} />
				Tap to play
			</span>
		</button>
	);
}
