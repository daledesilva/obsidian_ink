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
			if (isNestedObsidianEmbedImg(embedMarkerEl)) return;

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

	return dedupeReadingModeCandidatesByEditLink(candidates);
}

/** Obsidian nests img inside span.internal-embed — only the outer span is the embed marker. */
function isNestedObsidianEmbedImg(embedMarkerEl: HTMLElement): boolean {
	if (!(embedMarkerEl instanceof HTMLImageElement)) return false;

	const parentEmbedEl = embedMarkerEl.parentElement?.closest<HTMLElement>('.internal-embed[alt]');
	return !!parentEmbedEl && parentEmbedEl !== embedMarkerEl;
}

function dedupeReadingModeCandidatesByEditLink(
	candidates: ReadingModeInkEmbedCandidate[],
): ReadingModeInkEmbedCandidate[] {
	const bestByEditLink = new Map<HTMLAnchorElement, ReadingModeInkEmbedCandidate>();

	for (const candidate of candidates) {
		const existing = bestByEditLink.get(candidate.editLinkEl);
		if (!existing || preferReadingModeEmbedMarker(candidate, existing)) {
			bestByEditLink.set(candidate.editLinkEl, candidate);
		}
	}

	return [...bestByEditLink.values()];
}

function preferReadingModeEmbedMarker(
	candidate: ReadingModeInkEmbedCandidate,
	incumbent: ReadingModeInkEmbedCandidate,
): boolean {
	const candidateScore = readingModeEmbedMarkerScore(candidate.embedMarkerEl);
	const incumbentScore = readingModeEmbedMarkerScore(incumbent.embedMarkerEl);
	return candidateScore > incumbentScore;
}

function readingModeEmbedMarkerScore(embedMarkerEl: HTMLElement): number {
	let score = 0;
	if (embedMarkerEl.classList.contains('internal-embed') && embedMarkerEl.tagName !== 'IMG') {
		score += 2;
	}
	const srcAttr = embedMarkerEl.getAttribute('src');
	if (srcAttr && !isObsidianResourceUrl(srcAttr)) score += 1;
	return score;
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
	const srcAttr = embedMarkerEl.getAttribute('src');
	if (srcAttr) {
		const vaultPath = vaultRelativePathFromObsidianResource(srcAttr);
		if (vaultPath) return vaultPath;
		if (!isObsidianResourceUrl(srcAttr)) return srcAttr;
	}

	const parentEmbedEl = embedMarkerEl.closest<HTMLElement>('.internal-embed[alt][src]');
	if (parentEmbedEl) {
		const parentSrc = parentEmbedEl.getAttribute('src');
		if (parentSrc) {
			const vaultPath = vaultRelativePathFromObsidianResource(parentSrc);
			if (vaultPath) return vaultPath;
			if (!isObsidianResourceUrl(parentSrc)) return parentSrc;
		}
	}

	if (embedMarkerEl instanceof HTMLImageElement && embedMarkerEl.src) {
		return vaultRelativePathFromObsidianResource(embedMarkerEl.src);
	}

	return null;
}

function isObsidianResourceUrl(url: string): boolean {
	return url.startsWith('app://')
		|| url.startsWith('capacitor://')
		|| url.startsWith('obsidian://');
}

function vaultRelativePathFromObsidianResource(url: string): string | null {
	if (!isObsidianResourceUrl(url)) return null;

	const pathStart = url.indexOf('/', url.indexOf('://') + 3);
	if (pathStart === -1) return null;

	const pathWithQuery = url.slice(pathStart + 1);
	const pathOnly = pathWithQuery.split('?')[0];
	if (!pathOnly) return null;

	let decodedPath = pathOnly;
	try {
		decodedPath = decodeURIComponent(pathOnly);
	} catch {
		decodedPath = pathOnly;
	}

	// app://…/var/folders/…/qa-test-vault-…/Ink/Writing/file.svg → Ink/Writing/file.svg
	const inkPathMatch = decodedPath.match(/(?:^|\/)Ink\/(?:Writing|Drawing)\/.+\.svg$/i);
	if (inkPathMatch) {
		const inkIndex = decodedPath.search(/Ink\/(?:Writing|Drawing)\//i);
		if (inkIndex !== -1) return decodedPath.slice(inkIndex);
	}

	return decodedPath;
}
