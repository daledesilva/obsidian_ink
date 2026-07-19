import { EditorView } from '@codemirror/view';
import { editorLivePreviewField, MarkdownView } from 'obsidian';
import InkPlugin from 'src/main';
import { refreshDrawingEmbedsNow } from '../drawing/drawing-embed-extension/drawing-embed-extension';
import { refreshWritingEmbedsNow } from '../writing/writing-embed-extension/writing-embed-extension';

export type InkEmbedRefreshRequest = {
	viewportFrom?: number;
	forceRebuild?: boolean;
};

export function parseInkEmbedRefreshEffectValue(
	value: number | InkEmbedRefreshRequest | void | undefined,
): { viewportFrom?: number; forceRebuild: boolean } {
	if (typeof value === 'number') {
		return { viewportFrom: value, forceRebuild: false };
	}
	if (value && typeof value === 'object') {
		return {
			viewportFrom: value.viewportFrom,
			forceRebuild: value.forceRebuild ?? false,
		};
	}
	return { forceRebuild: false };
}

const LIVE_PREVIEW_EMBED_REFRESH_MAX_ATTEMPTS = 24;

/**
 * After leaving Reading mode, CM embed widgets may not exist until Live Preview is active.
 * Retries until editorLivePreviewField is true, then force-rebuilds widgets (no stale reuse).
 */
export function refreshLivePreviewEmbedsWhenReady(plugin: InkPlugin) {
	let attempt = 0;

	const tryRefresh = () => {
		attempt += 1;

		const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView || markdownView.getMode() !== 'source') return;

		const editor = markdownView.editor;
		// @ts-expect-error not typed by Obsidian
		const cmView = editor?.cm as EditorView | undefined;
		const isLivePreview = cmView?.state.field(editorLivePreviewField) ?? false;

		if (!cmView || !isLivePreview) {
			if (attempt < LIVE_PREVIEW_EMBED_REFRESH_MAX_ATTEMPTS) {
				requestAnimationFrame(tryRefresh);
			}
			return;
		}

		refreshDrawingEmbedsNow(undefined, { forceRebuild: true });
		refreshWritingEmbedsNow(undefined, { forceRebuild: true });
	};

	queueMicrotask(() => requestAnimationFrame(tryRefresh));
}
