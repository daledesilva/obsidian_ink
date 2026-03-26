/**
 * Helpers to get CodeMirror undo/redo depth from a MarkdownView, by active leaf or by WorkspaceLeaf.id.
 * Uses @codemirror/commands (external at runtime; Obsidian provides it).
 * @see docs/undo-redo-implementation.md
 */

import { undoDepth, redoDepth } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { MarkdownView } from 'obsidian';
import type InkPlugin from 'src/main';

export function getMarkdownViewForLeaf(plugin: InkPlugin, leafId: string): MarkdownView | null {
	let found: MarkdownView | null = null;
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		if (found) return;
		if (leaf.id === leafId && leaf.view instanceof MarkdownView) {
			found = leaf.view;
		}
	});
	return found;
}

function undoDepthFromMarkdownView(md: MarkdownView | null | undefined): number {
	const editor = md?.editor;
	if (!editor) return 0;
	const cmView = (editor as { cm?: EditorView }).cm;
	if (!cmView) return 0;
	try {
		return undoDepth(cmView.state);
	} catch {
		return 0;
	}
}

function redoDepthFromMarkdownView(md: MarkdownView | null | undefined): number {
	const editor = md?.editor;
	if (!editor) return 0;
	const cmView = (editor as { cm?: EditorView }).cm;
	if (!cmView) return 0;
	try {
		return redoDepth(cmView.state);
	} catch {
		return 0;
	}
}

export function getObsidianUndoDepth(plugin: InkPlugin): number {
	const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	return undoDepthFromMarkdownView(activeView);
}

export function getObsidianUndoDepthForLeaf(plugin: InkPlugin, leafId: string): number {
	return undoDepthFromMarkdownView(getMarkdownViewForLeaf(plugin, leafId));
}

export function getObsidianRedoDepth(plugin: InkPlugin): number {
	const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	return redoDepthFromMarkdownView(activeView);
}

export function getObsidianRedoDepthForLeaf(plugin: InkPlugin, leafId: string): number {
	return redoDepthFromMarkdownView(getMarkdownViewForLeaf(plugin, leafId));
}
