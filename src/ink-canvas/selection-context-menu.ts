import type { MenuOption } from 'src/components/jsx-components/overflow-menu/overflow-menu';
import { getEffectiveChrome, isPagePointInChrome, type SelectionChrome, type SelectionChromePreview } from './selection-chrome';
import type { InkTool } from './types';

///////////////////////////
///////////////////////////

export const SELECTION_CONTEXT_MENU_LONG_PRESS_MS = 500;
export const SELECTION_CONTEXT_MENU_LONG_PRESS_MOVE_THRESHOLD_PX = 10;

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
