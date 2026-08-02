import { useApp } from "../context/AppContext";
import { readProfileDisplayName } from "../lib/profile";

export function ProfilesPage() {
	const { settings, addProfile, switchProfile, deleteProfile } = useApp();

	return (
		<section className="appPage" id="profilesPage" aria-labelledby="profilesTitle">
			<h2 id="profilesTitle">Profiles</h2>
			<p
				id="storeDataWarning"
				style={{ display: settings.storeData ? "none" : "block" }}
			>
				Warning: “Save my feed” is off, so likes and recommendations won’t be kept
				until you turn it back on in Settings.
			</p>
			<div id="profilesList">
				{settings.profiles.map((profileId) => {
					const displayName = readProfileDisplayName(profileId);
					const isCurrent = profileId === settings.profile;
					return (
						<profile-entry
							key={profileId}
							className={isCurrent ? "current" : undefined}
						>
							<button
								type="button"
								className="profileSelect"
								aria-current={isCurrent ? "true" : undefined}
								onClick={() => void switchProfile(profileId)}
							>
								{displayName}
							</button>
							<button
								type="button"
								className="profileDelete"
								onClick={() => deleteProfile(profileId)}
							>
								Delete
							</button>
						</profile-entry>
					);
				})}
				<button
					type="button"
					onClick={() => {
						const name = prompt("Profile name");
						if (name?.length) addProfile(name);
					}}
				>
					Add profile
				</button>
			</div>
		</section>
	);
}
