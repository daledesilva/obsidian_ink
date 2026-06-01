import type { InkFileData } from '../types/file-data';

/** Storage engine for ink SVG metadata (`<ink-canvas version="…">` vs `<tldraw version="…">`). */
export type InkFileStorageEngine = 'tldraw' | 'ink-canvas';

/**
 * Which engine serialized this file. Inferred from payload, not a separate meta flag:
 * ink-canvas files include an `inkCanvas` snapshot (from `<ink-canvas version="…">`).
 */
export function getInkFileStorageEngine(fileData: InkFileData): InkFileStorageEngine {
	return fileData.inkCanvas != null ? 'ink-canvas' : 'tldraw';
}

export function isInkCanvasFile(fileData: InkFileData): boolean {
	return getInkFileStorageEngine(fileData) === 'ink-canvas';
}
