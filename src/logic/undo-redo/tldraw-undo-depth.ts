/**
 * Helper to get the undo count from either a tldraw Editor or an InkCanvasEditor.
 * tldraw Editor.history is protected; we access via (editor as any).
 * InkCanvasEditor exposes getUndoCount() directly.
 * @see docs/undo-redo-implementation.md
 */

import type { Editor } from '@tldraw/tldraw';
import type { InkCanvasEditor } from 'src/ink-canvas/types';
import type { AnyInkEditor } from './ink-editor-registry';

export function getTldrawNumUndos(editor: AnyInkEditor): number {
	// InkCanvasEditor has getUndoCount() directly
	if ('getUndoCount' in editor && typeof editor.getUndoCount === 'function') {
		return editor.getUndoCount();
	}
	// tldraw Editor: access protected history API
	const history = (editor as unknown as { history?: { getNumUndos?: () => number } }).history;
	return history?.getNumUndos?.() ?? 0;
}
