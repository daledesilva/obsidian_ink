import type { MenuOption } from 'src/components/jsx-components/overflow-menu/overflow-menu';
import { getEffectiveChrome, isPagePointInChrome, type SelectionChrome, type SelectionChromePreview } from './selection-chrome';
import type { InkTool } from './types';

///////////////////////////
///////////////////////////

export const SELECTION_CONTEXT_MENU_LONG_PRESS_MS = 500;
export const SELECTION_CONTEXT_MENU_LONG_PRESS_MOVE_THRESHOLD_PX = 10;

/**
 * Backspace and Delete match the selection menu's Delete action.
 * Modified chords stay with the host (word delete, undo) so a held Cmd does not wipe ink.
 */
export function isSelectionDeleteKeyboardEvent(event: KeyboardEvent): boolean {
	if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return false;
	return event.key === 'Backspace' || event.key === 'Delete';
}

/** Canvas last interacted with. Used when the host leaves focus on document.body. */
let selectionKeyCanvas: HTMLElement | null = null;

export function rememberSelectionKeyCanvas(container: HTMLElement | null): void {
	selectionKeyCanvas = container;
}

export function releaseSelectionKeyCanvas(container: HTMLElement): void {
	if (selectionKeyCanvas === container) selectionKeyCanvas = null;
}

/**
 * True when this canvas should take the key. A text field keeps Backspace.
 * The embed is focused on click and selection changes. document.body still
 * counts for the last interacted canvas if the host moves focus away.
 */
export function isKeyboardEventForInkEditor(canvasContainer: HTMLElement | null): boolean {
	if (!canvasContainer) return false;
	const active = canvasContainer.ownerDocument.activeElement;
	if (active instanceof Element && isTextEditingElement(active)) return false;
	if (active instanceof Node && canvasContainer.contains(active)) return true;
	const editorRoot = canvasContainer.closest('.ddc_ink_writing-editor, .ddc_ink_drawing-editor');
	if (active instanceof Node && editorRoot?.contains(active)) return true;
	const doc = canvasContainer.ownerDocument;
	const focusIsAppRoot = active == null || active === doc.body || active === doc.documentElement;
	return focusIsAppRoot && selectionKeyCanvas === canvasContainer;
}

function isTextEditingElement(node: Node): boolean {
	if (!(node instanceof HTMLElement)) return false;
	if (node.isContentEditable) return true;
	const tag = node.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Obsidian menu shown when the user invokes a menu on the selection chrome. */
export function buildSelectionStrokeContextMenuOptions(
	deleteSelectedStrokes: () => void,
): MenuOption[] {
	return [
		{
			text: 'Delete',
			destructive: true,
			action: deleteSelectedStrokes,
		},
	];
}

/** True when a page-space point lies on the active selection frame (not just on ink). */
export function isPagePointOnSelectionChrome(
	pagePoint: { x: number; y: number },
	tool: InkTool,
	selectedStrokeCount: number,
	chrome: SelectionChrome | null,
	preview: SelectionChromePreview | null,
): boolean {
	if (tool !== 'select' || selectedStrokeCount === 0 || !chrome) return false;
	const effectiveChrome = getEffectiveChrome(chrome, preview);
	return isPagePointInChrome(pagePoint, effectiveChrome);
}
