/**
 * Helper to get tldraw's undo count.
 * tldraw Editor.history is protected; we access via (editor as any).
 * @see docs/undo-redo-implementation.md
 */

import type { Editor } from '@tldraw/tldraw';

export function getTldrawNumUndos(editor: Editor): number {
	const history = (editor as any).history as { getNumUndos?: () => number } | undefined;
	return history?.getNumUndos?.() ?? 0;
}
