import { App, normalizePath, TFile } from 'obsidian';
import { parseSettingsFromUrl } from 'src/components/formats/current/utils/parse-settings-from-url';
import { EmbedSettings } from 'src/types/embed-settings';
import { InkEmbedKind } from './embed';

export const INK_READING_PROCESSED_ATTR = 'data-ink-reading-processed';

export type ReadingModeInkEmbedCandidate = {
	embedKind: InkEmbedKind;
	embedMarkerEl: HTMLElement;
	editLinkEl: HTMLAnchorElement;
	partialEmbedFilepath: string;
	embeddedFile: TFile | null;
	embedSettings: EmbedSettings;
	isPendingPaste: boolean;
};

const INK_EMBED_ALT_BY_KIND: Record<InkEmbedKind, string> = {
	drawing: 'InkDrawing',
	writing: 'InkWriting',
};

const INK_EDIT_LINK_FRAGMENT_BY_KIND: Record<InkEmbedKind, string> = {
	drawing: 'type=inkDrawing',
	writing: 'type=inkWriting',
};

export function findReadingModeInkEmbedCandidates(
	app: App,
	rootEl: HTMLElement,
	sourcePath: string,
): ReadingModeInkEmbedCandidate[] {
	const candidates: ReadingModeInkEmbedCandidate[] = [];

	for (const embedKind of ['drawing', 'writing'] as const) {
		const altText = INK_EMBED_ALT_BY_KIND[embedKind];
		const editLinkFragment = INK_EDIT_LINK_FRAGMENT_BY_KIND[embedKind];
		const markerSelector = `.internal-embed[alt="${altText}"], img[alt="${altText}"]`;
		const markerEls = rootEl.querySelectorAll<HTMLElement>(markerSelector);

		markerEls.forEach((embedMarkerEl) => {
			if (embedMarkerEl.closest(`[${INK_READING_PROCESSED_ATTR}]`)) return;

			const editLinkEl = findInkEditLinkForMarker(embedMarkerEl, editLinkFragment);
			if (!editLinkEl) return;

			const partialEmbedFilepath = extractPartialEmbedFilepath(embedMarkerEl);
			if (!partialEmbedFilepath) return;

			const settingsHref = editLinkEl.getAttribute('href') ?? '';
			const { embedSettings, isPendingPaste } = parseSettingsFromUrl(settingsHref);
			const embeddedFile = app.metadataCache.getFirstLinkpathDest(
				normalizePath(partialEmbedFilepath),
				sourcePath,
			);

			candidates.push({
				embedKind,
				embedMarkerEl,
				editLinkEl,
				partialEmbedFilepath,
				embeddedFile,
				embedSettings,
				isPendingPaste,
			});
		});
	}

	return candidates;
}

/**
 * Finds the Edit link that belongs to this embed marker — same block, after the marker in document order.
 */
function findInkEditLinkForMarker(embedMarkerEl: HTMLElement, editLinkFragment: string): HTMLAnchorElement | null {
	const blockScopeEl = findInkEmbedSearchScope(embedMarkerEl);
	if (!blockScopeEl) return null;

	const editLinks = blockScopeEl.querySelectorAll<HTMLAnchorElement>(`a[href*="${editLinkFragment}"]`);
	for (const editLinkEl of editLinks) {
		const position = embedMarkerEl.compareDocumentPosition(editLinkEl);
		const editLinkFollowsMarker = (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
		if (editLinkFollowsMarker) return editLinkEl;
	}

	return null;
}

/**
 * Search scope for the paired Edit link — prefer block wrappers, fall back to direct parent.
 */
function findInkEmbedSearchScope(embedMarkerEl: HTMLElement): HTMLElement | null {
	return embedMarkerEl.closest('p, .el-p, blockquote, .callout, .markdown-embed')
		?? embedMarkerEl.parentElement;
}

function extractPartialEmbedFilepath(embedMarkerEl: HTMLElement): string | null {
	const src = embedMarkerEl.getAttribute('src');
	if (src) return src;

	if (embedMarkerEl instanceof HTMLImageElement && embedMarkerEl.src) {
		// External/resource URLs are resolved later via metadataCache; src attr is preferred.
		return null;
	}

	return null;
}
