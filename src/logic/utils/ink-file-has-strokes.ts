import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { migrateFromTldraw } from 'src/ink-canvas/migrate-from-tldraw';
import type { InkStroke } from 'src/ink-canvas/types';

/** Strokes from ink metadata in an SVG string (ink-canvas or legacy tldraw). */
export function getInkStrokesFromSvg(svgString: string): InkStroke[] {
	const inkFileData = extractInkJsonFromSvg(svgString);
	if (!inkFileData) return [];

	if (isInkCanvasFile(inkFileData) && inkFileData.inkCanvas) {
		return inkFileData.inkCanvas.strokes ?? [];
	}

	const migrated = migrateFromTldraw(inkFileData.tldraw);
	return migrated.strokes ?? [];
}

export function inkFileHasStrokes(svgString: string): boolean {
	const inkCanvasResult = sniffInkCanvasHasStrokes(svgString);
	if (inkCanvasResult !== null) return inkCanvasResult;

	return getInkStrokesFromSvg(svgString).length > 0;
}

/**
 * Read only the `strokes` array opener from current ink-canvas metadata.
 * This avoids XML parsing and JSON-decoding every point in multi-megabyte files
 * when a locked preview only needs to distinguish an empty canvas.
 */
export function sniffInkCanvasHasStrokes(svgString: string): boolean | null {
	const inkCanvasStart = svgString.search(/<ink-canvas\b/i);
	if (inkCanvasStart === -1) return null;

	const inkCanvasEnd = svgString.indexOf('</ink-canvas>', inkCanvasStart);
	if (inkCanvasEnd === -1) return null;

	const strokesKey = svgString.indexOf('"strokes"', inkCanvasStart);
	if (strokesKey === -1 || strokesKey >= inkCanvasEnd) return null;

	const arrayStart = svgString.indexOf('[', strokesKey + '"strokes"'.length);
	if (arrayStart === -1 || arrayStart >= inkCanvasEnd) return null;

	let firstValueIndex = arrayStart + 1;
	while (firstValueIndex < inkCanvasEnd && /\s/.test(svgString[firstValueIndex])) {
		firstValueIndex += 1;
	}

	if (firstValueIndex >= inkCanvasEnd) return null;
	return svgString[firstValueIndex] !== ']';
}

/** When locked and empty, show frame/lines/background regardless of the matching setting. */
export function showLockedChrome(settingEnabled: boolean, hasStrokes: boolean | null): boolean {
	return settingEnabled || hasStrokes === false;
}
