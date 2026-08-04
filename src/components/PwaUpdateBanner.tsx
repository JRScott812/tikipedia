import { usePwaUpdate } from "../hooks/usePwaUpdate";

export function PwaUpdateBanner() {
	const { offlineReady, needRefresh, reload, dismiss } = usePwaUpdate();
	if (!offlineReady && !needRefresh) return null;

	return (
		<div
			role="status"
			className="pwaUpdateBanner"
			style={{
				position: "fixed",
				left: 12,
				right: 12,
				bottom: "calc(4.5rem + var(--safe-bottom, 0px))",
				zIndex: 40,
				display: "flex",
				gap: 8,
				alignItems: "center",
				justifyContent: "space-between",
				padding: "10px 12px",
				borderRadius: 12,
				background: "var(--tt-surface-3)",
				color: "var(--tt-text-1)",
				border: "1px solid var(--tt-line)"
			}}
		>
			<span style={{ fontSize: 13 }}>
				{needRefresh
					? "A new version of Tikipedia is ready."
					: "Tikipedia is ready to work offline."}
			</span>
			<span style={{ display: "flex", gap: 8 }}>
				{needRefresh ? (
					<button type="button" className="btn-outline" onClick={reload}>
						Update
					</button>
				) : null}
				<button type="button" className="btn-outline" onClick={dismiss}>
					Dismiss
				</button>
			</span>
		</div>
	);
}
