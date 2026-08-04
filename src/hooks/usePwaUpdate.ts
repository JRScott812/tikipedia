import { useRegisterSW } from "virtual:pwa-register/react";

/** Register the generated service worker and expose update / offline-ready state. */
export function usePwaUpdate() {
	const {
		offlineReady: [offlineReady, setOfflineReady],
		needRefresh: [needRefresh, setNeedRefresh],
		updateServiceWorker
	} = useRegisterSW({
		onRegisteredSW(_swUrl, registration) {
			if (registration) {
				// Check for updates periodically while the app is open.
				setInterval(
					() => {
						void registration.update();
					},
					60 * 60 * 1000
				);
			}
		}
	});

	return {
		offlineReady,
		needRefresh,
		reload: () => {
			void updateServiceWorker(true);
		},
		dismiss: () => {
			setOfflineReady(false);
			setNeedRefresh(false);
		}
	};
}
