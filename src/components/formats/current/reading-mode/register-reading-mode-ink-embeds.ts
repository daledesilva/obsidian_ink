import InkPlugin from 'src/main';
import {
	findReadingModeInkEmbedCandidates,
	INK_READING_PROCESSED_ATTR,
} from 'src/logic/utils/detect-reading-mode-ink-embed';
import { InkReadingEmbedHost } from './ink-reading-embed-host';
import '../drawing/drawing-embed/drawing-embed.scss';
import '../drawing/drawing-embed-preview/drawing-embed-preview.scss';
import '../writing/writing-embed/writing-embed.scss';
import '../writing/writing-embed-preview/writing-embed-preview.scss';

const READING_MODE_EMBED_SCAN_ROOT_SELECTOR = 'p, .el-p, .markdown-preview-section, blockquote, .callout, .markdown-embed';

export function registerReadingModeInkEmbeds(plugin: InkPlugin) {
	// Run late so block containers include the full embed marker + Edit link row.
	plugin.registerMarkdownPostProcessor((element, context) => {
		if (!element.matches(READING_MODE_EMBED_SCAN_ROOT_SELECTOR)) return;

		// Obsidian may invoke the processor before sibling nodes (e.g. Edit link) are attached.
		queueMicrotask(() => {
			if (!element.isConnected) return;

			const candidates = findReadingModeInkEmbedCandidates(
				plugin.app,
				element,
				context.sourcePath,
			);

			// Replace last-to-first so earlier DOM ranges stay valid while iterating.
			const sortedCandidates = [...candidates].sort((a, b) => {
				const position = b.embedMarkerEl.compareDocumentPosition(a.embedMarkerEl);
				return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ? 1 : -1;
			});

			for (const candidate of sortedCandidates) {
				if (!candidate.embedMarkerEl.isConnected || !candidate.editLinkEl.isConnected) continue;

				const hostEl = document.createElement('div');
				hostEl.setAttribute(INK_READING_PROCESSED_ATTR, 'true');
				hostEl.classList.add('ddc_ink_reading-embed-host');

				replaceInkEmbedRangeWithHost(candidate.embedMarkerEl, candidate.editLinkEl, hostEl);

				context.addChild(new InkReadingEmbedHost(hostEl, {
					plugin,
					embedKind: candidate.embedKind,
					embeddedFile: candidate.embeddedFile,
					partialEmbedFilepath: candidate.partialEmbedFilepath,
					embedSettings: candidate.embedSettings,
				}));
			}
		});
	}, 100);
}

/** Replaces only the native embed marker through the Edit link — not the whole preview section. */
function replaceInkEmbedRangeWithHost(
	embedMarkerEl: HTMLElement,
	editLinkEl: HTMLElement,
	hostEl: HTMLElement,
) {
	const range = document.createRange();
	range.setStartBefore(embedMarkerEl);
	range.setEndAfter(editLinkEl);
	range.deleteContents();

	const parentEl = range.startContainer.parentElement;
	if (!parentEl) return;

	range.insertNode(hostEl);

	// Remove an now-empty wrapper paragraph Obsidian sometimes leaves behind.
	const emptyParagraphEl = hostEl.parentElement;
	if (
		emptyParagraphEl
		&& (emptyParagraphEl.tagName === 'P' || emptyParagraphEl.classList.contains('el-p'))
		&& emptyParagraphEl.childNodes.length === 1
		&& emptyParagraphEl.textContent?.trim() === ''
	) {
		emptyParagraphEl.replaceWith(hostEl);
	}
}
