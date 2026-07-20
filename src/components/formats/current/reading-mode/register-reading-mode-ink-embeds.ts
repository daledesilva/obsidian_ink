import { MarkdownPostProcessorContext, MarkdownView, normalizePath } from 'obsidian';
import InkPlugin from 'src/main';
import {
	findReadingModeInkEmbedCandidates,
	INK_READING_ACTIVE_ATTR,
	INK_READING_MOUNTING_ATTR,
	INK_READING_PROCESSED_ATTR,
	ReadingModeInkEmbedCandidate,
} from 'src/logic/utils/detect-reading-mode-ink-embed';
import { InkEmbedKind } from 'src/logic/utils/embed';
import { EmbedSettings } from 'src/types/embed-settings';
import { InkReadingEmbedHost, refreshReadingModeEmbedDimensionsInRoot } from './ink-reading-embed-host';
import { refreshLivePreviewEmbedsWhenReady } from '../ink-embeds-extension/ink-embed-refresh';
import '../drawing/drawing-embed/drawing-embed.scss';
import '../drawing/drawing-embed-preview/drawing-embed-preview.scss';
import '../writing/writing-embed/writing-embed.scss';
import '../writing/writing-embed-preview/writing-embed-preview.scss';

const READING_MODE_EMBED_SCAN_ROOT_SELECTOR = 'p, .el-p, .markdown-preview-section, blockquote, .callout, .markdown-embed';
/** Obsidian PDF export passes the entire preview pane as `el`, not individual sections. */
const FULL_PAGE_PREVIEW_ROOT_SELECTOR = '.markdown-preview-view';

const INK_READING_EMBED_KIND_DATA = 'inkEmbedKind';
const INK_READING_FILE_PATH_DATA = 'inkFilePath';
const INK_READING_EMBED_SETTINGS_DATA = 'inkEmbedSettings';
const INK_READING_SOURCE_PATH_DATA = 'inkSourcePath';

export function registerReadingModeInkEmbeds(plugin: InkPlugin) {
	// Run late so block containers include the full embed marker + Edit link row.
	// Reading mode passes section elements (p, .el-p, …); PDF export passes the entire
	// .markdown-preview-view — both roots must be accepted or export shows the full SVG.
	plugin.registerMarkdownPostProcessor((element, context) => {
		const matchesScanRoot = element.matches(READING_MODE_EMBED_SCAN_ROOT_SELECTOR);
		const isFullPagePreviewRoot = element.matches(FULL_PAGE_PREVIEW_ROOT_SELECTOR);
		if (!matchesScanRoot && !isFullPagePreviewRoot) return;

		// Obsidian may invoke the processor before sibling nodes (e.g. Edit link) are attached.
		queueMicrotask(() => {
			if (!element.isConnected) return;

			processReadingModeInkEmbedsInRoot(plugin, element, context);
		});
	}, 100);

	// Obsidian may reuse cached reading-view DOM when toggling LP ↔ RM. MarkdownRenderChild
	// onunload clears React content but leaves host shells — remount when preview is shown again.
	// When returning to Live Preview, rebuild CM embed widgets (they only refresh on down-scroll otherwise).
	const scheduleReadingModeOrLivePreviewEmbedRefresh = () => {
		queueMicrotask(() => {
			const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!markdownView) return;

			if (markdownView.getMode() === 'preview') {
				remountStaleReadingEmbedHostsInActivePreview(plugin);
			} else {
				refreshLivePreviewEmbedsWhenReady(plugin);
			}
		});
	};
	plugin.registerEvent(plugin.app.workspace.on('layout-change', scheduleReadingModeOrLivePreviewEmbedRefresh));
	plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', scheduleReadingModeOrLivePreviewEmbedRefresh));
}

function processReadingModeInkEmbedsInRoot(
	plugin: InkPlugin,
	rootEl: HTMLElement,
	context: MarkdownPostProcessorContext,
) {
	const isFullPageRoot = rootEl.matches(FULL_PAGE_PREVIEW_ROOT_SELECTOR);
	const candidates = findReadingModeInkEmbedCandidates(
		plugin.app,
		rootEl,
		context.sourcePath,
	);

	// Replace last-to-first so earlier DOM ranges stay valid while iterating.
	const sortedCandidates = [...candidates].sort((a, b) => {
		const position = b.embedMarkerEl.compareDocumentPosition(a.embedMarkerEl);
		return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ? 1 : -1;
	});

	for (const candidate of sortedCandidates) {
		if (!candidate.embedMarkerEl.isConnected || !candidate.editLinkEl.isConnected) {
			continue;
		}

		const hostEl = activeDocument.createElement('div');
		hostEl.setAttribute(INK_READING_PROCESSED_ATTR, 'true');
		hostEl.classList.add('ddc_ink_reading-embed-host');
		stampReadingEmbedHostMetadata(hostEl, candidate, context.sourcePath);

		replaceInkEmbedRangeWithHost(candidate.embedMarkerEl, candidate.editLinkEl, hostEl);

		mountReadingEmbedHost(plugin, hostEl, {
			plugin,
			embedKind: candidate.embedKind,
			embeddedFile: candidate.embeddedFile,
			partialEmbedFilepath: candidate.partialEmbedFilepath,
			embedSettings: candidate.embedSettings,
			sourcePath: context.sourcePath,
		}, context);
	}

	// Defer stale-host recovery until after React commit. On the full-page PDF export path,
	// skip remount entirely — hosts were just created and a synchronous remount races React
	// (active but no .ddc_ink_embed yet), re-mounts via plugin.addChild, and never unloads,
	// leaving Obsidian's export progress bar stuck.
	// Popout-safe: schedule on the window that owns this preview root.
	window.requestAnimationFrame(() => {
		if (!isFullPageRoot) {
			remountStaleReadingEmbedHostsInRoot(plugin, rootEl, context.sourcePath);
		}
		refreshReadingModeEmbedDimensionsInRoot(rootEl);
	});
}

function remountStaleReadingEmbedHostsInActivePreview(plugin: InkPlugin) {
	const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!markdownView || markdownView.getMode() !== 'preview') return;

	const sourcePath = markdownView.file?.path;
	if (!sourcePath) return;

	const previewEl = markdownView.containerEl.querySelector('.markdown-reading-view');
	if (!(previewEl instanceof HTMLElement)) return;

	remountStaleReadingEmbedHostsInRoot(plugin, previewEl, sourcePath);
	// Reading pane may have been display:none while in LP — re-measure fluid layouts.
	window.requestAnimationFrame(() => {
		refreshReadingModeEmbedDimensionsInRoot(previewEl);
	});
}

function remountStaleReadingEmbedHostsInRoot(
	plugin: InkPlugin,
	rootEl: HTMLElement,
	sourcePath: string,
) {
	const staleHostEls = [...rootEl.querySelectorAll<HTMLElement>(
		`.ddc_ink_reading-embed-host[${INK_READING_PROCESSED_ATTR}]`,
	)].filter((hostEl) => {
		if (hostEl.hasAttribute(INK_READING_MOUNTING_ATTR)) return false;
		if (!hostEl.hasAttribute(INK_READING_ACTIVE_ATTR)) return true;
		return !hostEl.querySelector('.ddc_ink_embed');
	});

	if (staleHostEls.length === 0) return;

	for (const hostEl of staleHostEls) {
		hostEl.removeAttribute(INK_READING_ACTIVE_ATTR);
		hostEl.replaceChildren();
		const params = readReadingEmbedHostParams(plugin, hostEl, sourcePath);
		if (!params) continue;
		mountReadingEmbedHost(plugin, hostEl, params);
	}
}

function stampReadingEmbedHostMetadata(
	hostEl: HTMLElement,
	candidate: ReadingModeInkEmbedCandidate,
	sourcePath: string,
) {
	hostEl.dataset[INK_READING_EMBED_KIND_DATA] = candidate.embedKind;
	hostEl.dataset[INK_READING_FILE_PATH_DATA] = candidate.partialEmbedFilepath;
	hostEl.dataset[INK_READING_EMBED_SETTINGS_DATA] = JSON.stringify(candidate.embedSettings);
	hostEl.dataset[INK_READING_SOURCE_PATH_DATA] = sourcePath;
}

function readReadingEmbedHostParams(
	plugin: InkPlugin,
	hostEl: HTMLElement,
	fallbackSourcePath: string,
) {
	const embedKind = hostEl.dataset[INK_READING_EMBED_KIND_DATA] as InkEmbedKind | undefined;
	const partialEmbedFilepath = hostEl.dataset[INK_READING_FILE_PATH_DATA];
	const embedSettingsJson = hostEl.dataset[INK_READING_EMBED_SETTINGS_DATA];
	if (!embedKind || !partialEmbedFilepath || !embedSettingsJson) return null;

	let embedSettings: EmbedSettings;
	try {
		embedSettings = JSON.parse(embedSettingsJson) as EmbedSettings;
	} catch {
		return null;
	}

	const sourcePath = hostEl.dataset[INK_READING_SOURCE_PATH_DATA] || fallbackSourcePath;
	const embeddedFile = plugin.app.metadataCache.getFirstLinkpathDest(
		normalizePath(partialEmbedFilepath),
		sourcePath,
	);

	return {
		plugin,
		embedKind,
		embeddedFile,
		partialEmbedFilepath,
		embedSettings,
		sourcePath,
	};
}

function mountReadingEmbedHost(
	plugin: InkPlugin,
	hostEl: HTMLElement,
	params: ConstructorParameters<typeof InkReadingEmbedHost>[1],
	context?: MarkdownPostProcessorContext,
) {
	if (hostEl.hasAttribute(INK_READING_ACTIVE_ATTR) || hostEl.hasAttribute(INK_READING_MOUNTING_ATTR)) {
		return;
	}

	hostEl.setAttribute(INK_READING_MOUNTING_ATTR, 'true');
	const host = new InkReadingEmbedHost(hostEl, params);
	if (context) {
		context.addChild(host);
	} else {
		plugin.addChild(host);
	}
}

/** Replaces only the native embed marker through the Edit link — not the whole preview section. */
function replaceInkEmbedRangeWithHost(
	embedMarkerEl: HTMLElement,
	editLinkEl: HTMLElement,
	hostEl: HTMLElement,
) {
	const range = activeDocument.createRange();
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
