import { EditorState, Facet } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorLivePreviewField, MarkdownView, TFile } from 'obsidian';
import type InkPlugin from 'src/main';

/**
 * Source note path of an editor that is not a MarkdownView (e.g. another plugin's
 * embedded Live Preview editor). Set through InkPlugin.getEmbeddableEditorExtensions().
 */
export const inkEmbedSourcePathFacet = Facet.define<string, string | null>({
	combine: (values) => values[0] ?? null,
});

export type InkEmbedHost = {
	mdFile: TFile | null;
	isLivePreview: boolean;
};

/**
 * Note and editor mode that embed decorations are built for.
 * Editors with a source path use their own state; all others use the active MarkdownView.
 */
export function getInkEmbedHost(plugin: InkPlugin, state: EditorState): InkEmbedHost | null {
	const sourcePath = state.facet(inkEmbedSourcePathFacet);
	if (sourcePath !== null) {
		return {
			mdFile: plugin.app.vault.getFileByPath(sourcePath),
			isLivePreview: state.field(editorLivePreviewField, false) ?? false,
		};
	}

	const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView?.editor) return null;

	// @ts-expect-error, not typed
	const cmEditorView = activeView.editor.cm as EditorView;
	return {
		mdFile: activeView.file,
		isLivePreview: cmEditorView.state.field(editorLivePreviewField),
	};
}
