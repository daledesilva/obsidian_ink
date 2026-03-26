/**
 * tldraw Editor instances for dedicated ink views, keyed by WorkspaceLeaf.id.
 */

import type { Editor } from '@tldraw/tldraw';

const dedicatedInkEditorByLeafId = new Map<string, Editor>();

export function registerDedicatedInkEditor(leafId: string, editor: Editor): void {
	dedicatedInkEditorByLeafId.set(leafId, editor);
}

export function unregisterDedicatedInkEditor(leafId: string, editor: Editor): void {
	if (dedicatedInkEditorByLeafId.get(leafId) === editor) {
		dedicatedInkEditorByLeafId.delete(leafId);
	}
}

export function getDedicatedInkEditor(leafId: string): Editor | null {
	return dedicatedInkEditorByLeafId.get(leafId) ?? null;
}
