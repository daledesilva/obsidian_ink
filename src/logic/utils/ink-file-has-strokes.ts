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
	return getInkStrokesFromSvg(svgString).length > 0;
}

/** When locked and empty, show frame/lines/background regardless of the matching setting. */
export function showLockedChrome(settingEnabled: boolean, hasStrokes: boolean | null): boolean {
	return settingEnabled || hasStrokes === false;
}
