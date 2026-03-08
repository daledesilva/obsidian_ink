/**
 * Registry mapping embedId to tldraw Editor instances.
 * Used to look up which editor to call undo/redo on when popping an "embed" entry.
 * @see docs/undo-redo-implementation.md
 */

import type { Editor } from '@tldraw/tldraw';
import { clearEmbedBaseline } from './unified-undo-stack';

interface RegistryEntry {
	editor: Editor;
	containerEl: HTMLElement;
}

const registry = new Map<string, RegistryEntry>();
let lastRegisteredEmbedId: string | null = null;

export function register(embedId: string, editor: Editor, containerEl: HTMLElement): void {
	registry.set(embedId, { editor, containerEl });
	lastRegisteredEmbedId = embedId;
}

export function unregister(embedId: string): void {
	registry.delete(embedId);
	clearEmbedBaseline(embedId);
	if (lastRegisteredEmbedId === embedId) {
		lastRegisteredEmbedId = null;
	}
}

export function getEditor(embedId: string): Editor | undefined {
	return registry.get(embedId)?.editor;
}

/**
 * Returns the most recently registered embed id, if any.
 * When only one embed is in edit mode at a time, this is the active one.
 */
export function getActiveEmbedId(): string | null {
	return lastRegisteredEmbedId;
}
