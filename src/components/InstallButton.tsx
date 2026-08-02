import { usePwaInstall } from "../hooks/usePwaInstall";
import { Icon } from "./Icon";

export function InstallButton() {
	const { visible, install } = usePwaInstall();
	if (!visible) return null;
	return (
		<button type="button" id="install" onClick={() => void install()}>
			<Icon className="navIcon" name="download" size={25} />
			Install
		</button>
	);
}
