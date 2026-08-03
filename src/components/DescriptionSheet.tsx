import { useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { getArticleLink, engagePost } from "../lib/wiki";

export function DescriptionSheet() {
	const {
		desc,
		closeDescription,
		openPostByTitle,
		settings,
		save,
		engagement,
		appData,
		setPaused,
		playbackPaused,
		sectionPlayback,
		selectSection,
		clearSectionError
	} = useApp();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const wasPaused = useRef(false);

	useEffect(() => {
		const el = dialogRef.current;
		if (!el) return;
		if (desc) {
			wasPaused.current = playbackPaused;
			if (!el.open) el.showModal();
		} else if (el.open) {
			el.close();
		}
	}, [desc, playbackPaused]);

	const onClose = () => {
		closeDescription();
		if (!wasPaused.current) setPaused(false);
	};

	const selectedIndex =
		desc && sectionPlayback && sectionPlayback.postId === desc.post.id
			? sectionPlayback.sectionIndex
			: 0;

	const bodyText =
		desc && sectionPlayback && sectionPlayback.postId === desc.post.id
			? sectionPlayback.text
			: desc?.post.text || "";

	return (
		<dialog
			ref={dialogRef}
			id="descriptionSheet"
			aria-labelledby="descTitle"
			{...({ closedby: "any" } as object)}
			onClose={onClose}
		>
			<div className="descHeader">
				<h2 id="descTitle">{desc?.post.title || ""}</h2>
				<button
					type="button"
					className="closeButton closeDesc"
					aria-label="Close"
					onClick={onClose}
				>
					×
				</button>
			</div>
			<p className="descSummary" id="descSummary">
				{bodyText}
			</p>
			{desc ? (
				<div className="descSections" id="descSections">
					<p className="descSectionsLabel">Play section</p>
					{desc.sectionsLoading ? (
						<p className="descSectionsStatus" role="status">
							Loading sections…
						</p>
					) : null}
					{desc.sectionError ? (
						<p className="descSectionsError" role="alert">
							{desc.sectionError}
						</p>
					) : null}
					<div className="descSectionList" role="list">
						<button
							type="button"
							role="listitem"
							className="descSectionBtn"
							aria-pressed={selectedIndex === 0}
							data-selected={selectedIndex === 0 ? "1" : undefined}
							onClick={() => {
								clearSectionError();
								void selectSection(desc.post, {
									index: 0,
									title: "Summary"
								});
							}}
						>
							Summary
						</button>
						{desc.sections.map((section) => (
							<button
								key={section.index}
								type="button"
								role="listitem"
								className="descSectionBtn"
								aria-pressed={selectedIndex === section.index}
								data-selected={
									selectedIndex === section.index ? "1" : undefined
								}
								onClick={() => {
									clearSectionError();
									void selectSection(desc.post, section);
								}}
							>
								{section.title}
							</button>
						))}
					</div>
				</div>
			) : null}
			<div className="descLinks" id="descLinks">
				{desc?.related.map((rel) => (
					<button
						key={rel.id}
						type="button"
						onClick={() => {
							onClose();
							void openPostByTitle(rel.title);
						}}
					>
						{rel.title}
					</button>
				))}
			</div>
			<div className="descActions">
				<button
					type="button"
					className="openArticle"
					id="descOpenArticle"
					onClick={() => {
						if (!desc) return;
						window.open(
							getArticleLink(desc.post.title, settings, true),
							"_blank",
							"noopener,noreferrer"
						);
						engagePost(
							desc.post,
							75,
							engagement.categoryScores,
							appData?.topicNoiseRe || []
						);
						setTimeout(save, 100);
					}}
				>
					Open full article
				</button>
				<button type="button" className="closeDesc" onClick={onClose}>
					Close
				</button>
			</div>
		</dialog>
	);
}
