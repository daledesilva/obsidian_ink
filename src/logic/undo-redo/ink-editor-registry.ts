/**
 * Registry mapping embedId to tldraw Editor instances and owning WorkspaceLeaf.id.
 * @see docs/undo-redo-implementation.md
 */

import type { Editor } from '@tldraw/tldraw';
import { clearEmbedBaseline, purgeEmbedEntriesFromStacks } from './unified-undo-stack';

export type ApplyResizeFn = (width: number, aspectRatio: number) => void;

interface RegistryEntry {
	editor: Editor;
	containerEl: HTMLElement;
	workspaceLeafId: string;
	applyResize?: ApplyResizeFn;
}

const registry = new Map<string, RegistryEntry>();
/** Last-focused embed per markdown leaf (mousedown on embed container). */
const activeEmbedIdByLeafId = new Map<string, string>();

function firstEmbedIdInLeaf(workspaceLeafId: string): string | null {
	for (const [embedId, entry] of registry) {
		if (entry.workspaceLeafId === workspaceLeafId) {
			return embedId;
		}
	}
	return null;
}

export function register(
	embedId: string,
	editor: Editor,
	containerEl: HTMLElement,
	workspaceLeafId: string,
	applyResize?: ApplyResizeFn,
): void {
	registry.set(embedId, { editor, containerEl, workspaceLeafId, applyResize });
	activeEmbedIdByLeafId.set(workspaceLeafId, embedId);
	containerEl.addEventListener('mousedown', () => {
		setActiveEmbedForLeaf(workspaceLeafId, embedId);
	});
}

export function setActiveEmbedForLeaf(workspaceLeafId: string, embedId: string): void {
	const entry = registry.get(embedId);
	if (entry && entry.workspaceLeafId === workspaceLeafId) {
		activeEmbedIdByLeafId.set(workspaceLeafId, embedId);
	}
}

export function unregister(embedId: string): void {
	const entry = registry.get(embedId);
	if (!entry) return;
	const { workspaceLeafId } = entry;
	registry.delete(embedId);
	clearEmbedBaseline(workspaceLeafId, embedId);
	purgeEmbedEntriesFromStacks(workspaceLeafId, embedId);
	if (activeEmbedIdByLeafId.get(workspaceLeafId) === embedId) {
		const next = firstEmbedIdInLeaf(workspaceLeafId);
		if (next) activeEmbedIdByLeafId.set(workspaceLeafId, next);
		else activeEmbedIdByLeafId.delete(workspaceLeafId);
	}
}

export function getEditor(embedId: string): Editor | undefined {
	return registry.get(embedId)?.editor;
}

export function getResizeApplier(embedId: string): ApplyResizeFn | undefined {
	return registry.get(embedId)?.applyResize;
}

export function getRegisteredEmbedCount(): number {
	return registry.size;
}

export function getRegisteredEmbedCountForLeaf(workspaceLeafId: string): number {
	let n = 0;
	for (const entry of registry.values()) {
		if (entry.workspaceLeafId === workspaceLeafId) n++;
	}
	return n;
}

export function getActiveEmbedIdForLeaf(workspaceLeafId: string): string | null {
	const id = activeEmbedIdByLeafId.get(workspaceLeafId);
	if (id && registry.has(id)) return id;
	return null;
}
