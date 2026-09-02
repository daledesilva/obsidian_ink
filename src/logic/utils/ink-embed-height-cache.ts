/**
 * Height cache for CM ink embed widgets.
 * Remembers measured layout height across widget remounts so estimatedHeight and
 * minHeight reserves stay stable and scroll position does not jump on up-scroll.
 *
 * REGRESSION (iPad Live Preview): never replace `inkEmbedScheduleAfterLayout` with a
 * synchronous `offsetHeight` read inside `toDOM` right after `root.render()`. That
 * measure often sees 0px / pre-paint and skips updating the cache; removing the
 * after-layout path (while stripping debug logs) brought scroll jumps back.
 * See docs/embed-scrolling.md — CodeMirror remount height.
 */
import { getDefaultStore, type Atom } from 'jotai';

/** Whether this embedId is currently marked unlocked in a jotai Set atom. */
export function inkEmbedIsInEditModeAtom(editModeAtom: Atom<Set<string>>, embedId: string | null | undefined): boolean {
	if (!embedId) return false;
	try {
		return getDefaultStore().get(editModeAtom).has(embedId);
	} catch {
		return false;
	}
}

/**
 * Cache widget layout height for CM estimatedHeight.
 * While unlocked, ignore remount flashes that shrink toward preview height (that caused scroll jumps).
 */
export function inkEmbedRememberMeasuredHeightPx(options: {
	previousHeightPx: number | null;
	nextHeightPx: number;
	isInEditMode: boolean;
}): number | null {
	const { previousHeightPx, nextHeightPx, isInEditMode } = options;
	if (!(nextHeightPx > 0)) return previousHeightPx;
	if (
		isInEditMode
		&& previousHeightPx
		&& previousHeightPx > 0
		&& nextHeightPx < previousHeightPx * 0.9
	) {
		return previousHeightPx;
	}
	return nextHeightPx;
}

/** Survives forceRebuild NEW widgets (instance id changes; filepath does not). */
const inkEmbedHeightByFilepathPx = new Map<string, number>();

export function inkEmbedStoreHeightForFilepath(filepath: string | null | undefined, heightPx: number | null): void {
	if (!filepath || !(heightPx && heightPx > 0)) return;
	inkEmbedHeightByFilepathPx.set(filepath, heightPx);
}

export function inkEmbedRecallHeightForFilepath(filepath: string | null | undefined): number | null {
	if (!filepath) return null;
	return inkEmbedHeightByFilepathPx.get(filepath) ?? null;
}

/**
 * Run after React + browser layout settle.
 * Required for height cache / CM requestMeasure after widget `toDOM` — must see the
 * painted widget, not the empty shell. Do not inline a sync measure in `toDOM` instead.
 */
export function inkEmbedScheduleAfterLayout(callback: () => void): void {
	queueMicrotask(() => {
		requestAnimationFrame(() => {
			requestAnimationFrame(callback);
		});
	});
}
