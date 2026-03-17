/**
 * Registry mapping embedId to tldraw Editor instances.
 * Used to look up which editor to call undo/redo on when popping an "embed" entry.
 * @see docs/undo-redo-implementation.md
 */

import type { Editor } from '@tldraw/tldraw';
import { clearEmbedBaseline, purgeEmbedEntriesFromStacks } from './unified-undo-stack';

export type ApplyResizeFn = (width: number, aspectRatio: number) => void;

interface RegistryEntry {
	editor: Editor;
	containerEl: HTMLElement;
	applyResize?: ApplyResizeFn;
}

const registry = new Map<string, RegistryEntry>();
let lastRegisteredEmbedId: string | null = null;

export function register(
	embedId: string,
	editor: Editor,
	containerEl: HTMLElement,
	applyResize?: ApplyResizeFn,
): void {
	registry.set(embedId, { editor, containerEl, applyResize });
	lastRegisteredEmbedId = embedId;
	// Update active when embedding is focused (click) so undo/redo sync targets the right embed
	containerEl.addEventListener('mousedown', () => setActiveEmbedId(embedId));
}

export function setActiveEmbedId(embedId: string | null): void {
	if (embedId === null) {
		lastRegisteredEmbedId = null;
		return;
	}
	if (registry.has(embedId)) {
		lastRegisteredEmbedId = embedId;
	}
}

export function unregister(embedId: string): void {
	registry.delete(embedId);
	clearEmbedBaseline(embedId);
	purgeEmbedEntriesFromStacks(embedId);
	if (lastRegisteredEmbedId === embedId) {
		// Fall back to another still-registered embed so undo/redo keeps working
		const anyRemaining = registry.keys().next().value ?? null;
		lastRegisteredEmbedId = anyRemaining;
	}
}

export function getEditor(embedId: string): Editor | undefined {
	return registry.get(embedId)?.editor;
}

export function getResizeApplier(embedId: string): ApplyResizeFn | undefined {
	return registry.get(embedId)?.applyResize;
}

/**
 * Returns the number of embeds currently registered.
 * Used to detect when a new embed is joining an existing session (merge mode).
 */
export function getRegisteredEmbedCount(): number {
	return registry.size;
}

/**
 * Returns the most recently registered embed id, if any.
 * When only one embed is in edit mode at a time, this is the active one.
 */
export function getActiveEmbedId(): string | null {
	return lastRegisteredEmbedId;
}
