/**
 * Resolve which workspace leaf owns a CodeMirror EditorView (e.g. Live Preview source).
 */

import type { EditorView } from '@codemirror/view';
import { MarkdownView, WorkspaceLeaf } from 'obsidian';
import type InkPlugin from 'src/main';

export function getWorkspaceLeafForEditorView(
	plugin: InkPlugin,
	editorView: EditorView,
): WorkspaceLeaf | null {
	let found: WorkspaceLeaf | null = null;
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		if (found) return;
		const view = leaf.view;
		if (view instanceof MarkdownView) {
			const cm = (view.editor as { cm?: EditorView }).cm;
			if (cm === editorView) {
				found = leaf;
			}
		}
	});
	return found;
}
