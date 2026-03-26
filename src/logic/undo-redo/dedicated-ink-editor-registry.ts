/**
 * Single tldraw Editor instance for the active dedicated ink view (writing or drawing).
 * Used for document-capture undo/redo when focus is on BODY (wrapper does not receive keydown).
 */

import type { Editor } from '@tldraw/tldraw';

let dedicatedInkEditor: Editor | null = null;

export function registerDedicatedInkEditor(editor: Editor): void {
	dedicatedInkEditor = editor;
}

export function unregisterDedicatedInkEditor(editor: Editor): void {
	if (dedicatedInkEditor === editor) {
		dedicatedInkEditor = null;
	}
}

export function getDedicatedInkEditor(): Editor | null {
	return dedicatedInkEditor;
}
