/**
 * Ink editor instances for dedicated ink views, keyed by WorkspaceLeaf.id.
 * Accepts both tldraw Editor and InkCanvasEditor.
 */

import type { Editor } from '@tldraw/tldraw';
import type { InkCanvasEditor } from 'src/ink-canvas/types';

type AnyDedicatedEditor = Editor | InkCanvasEditor;

const dedicatedInkEditorByLeafId = new Map<string, AnyDedicatedEditor>();

export function registerDedicatedInkEditor(leafId: string, editor: AnyDedicatedEditor): void {
	dedicatedInkEditorByLeafId.set(leafId, editor);
}

export function unregisterDedicatedInkEditor(leafId: string, editor: AnyDedicatedEditor): void {
	if (dedicatedInkEditorByLeafId.get(leafId) === editor) {
		dedicatedInkEditorByLeafId.delete(leafId);
	}
}

export function getDedicatedInkEditor(leafId: string): AnyDedicatedEditor | null {
	return dedicatedInkEditorByLeafId.get(leafId) ?? null;
}
