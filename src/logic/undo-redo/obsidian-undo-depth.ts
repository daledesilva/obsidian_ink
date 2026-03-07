/**
 * Helpers to get CodeMirror undo/redo depth from the active Obsidian markdown editor.
 * Uses @codemirror/commands (external at runtime; Obsidian provides it).
 * @see docs/undo-redo-implementation.md
 */

import { undoDepth, redoDepth } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { MarkdownView } from 'obsidian';
import type InkPlugin from 'src/main';

export function getObsidianUndoDepth(plugin: InkPlugin): number {
	const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const editor = activeView?.editor;
	if (!editor) return 0;

	const cmView = (editor as any).cm as EditorView | undefined;
	if (!cmView) return 0;

	try {
		return undoDepth(cmView.state);
	} catch {
		return 0;
	}
}

export function getObsidianRedoDepth(plugin: InkPlugin): number {
	const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const editor = activeView?.editor;
	if (!editor) return 0;

	const cmView = (editor as any).cm as EditorView | undefined;
	if (!cmView) return 0;

	try {
		return redoDepth(cmView.state);
	} catch {
		return 0;
	}
}
