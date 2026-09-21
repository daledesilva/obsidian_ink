import type { InkFileData } from 'src/components/formats/current/types/file-data';
import type { InkStroke } from 'src/ink-canvas/types';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import { migrateFromTldraw } from 'src/ink-canvas/migrate-from-tldraw';

//////////
//////////

/** Coarse grid so nearby points collide; Jaccard then reflects ink occupancy, not raw point jitter. */
const GRID_CELL_SIZE_PX = 32;
/** Separator for serialized cell keys (`cellX,cellY` contains commas). */
const BBOX_CELL_SET_SEPARATOR = '|';

export const AUTO_TRANSCRIBE_CHANGE_THRESHOLD_MAX_PERCENT = 95;

/**
 * Returns true when the ink file has at least one stroke point to transcribe.
 */
export function inkFileHasStrokes(pageData: InkFileData): boolean {
	return collectWorldStrokePoints(pageData).length > 0;
}

/**
 * Sorted unique 32px cells relative to the stroke bounding-box origin.
 */
export function serializeBboxCellsAtLastTranscription(pageData: InkFileData): string {
	return collectUniqueBboxCells(pageData).join(BBOX_CELL_SET_SEPARATOR);
}

/**
 * Fraction of bbox cells in symmetric difference vs union (0 identical sets, 1 disjoint).
 * Aligns with the settings slider: occupied-cell change, not Hamming bits.
 */
export function bboxCellsJaccardChangeRatio(
	storedSerialized: string,
	livePageData: InkFileData,
): number {
	const stored = parseBboxCellSet(storedSerialized);
	const live = new Set(collectUniqueBboxCells(livePageData));
	if (stored.size === 0 && live.size === 0) return 0;
	let intersection = 0;
	for (const cell of stored) {
		if (live.has(cell)) intersection += 1;
	}
	const unionSize = stored.size + live.size - intersection;
	if (unionSize === 0) return 0;
	const symmetricDiff = stored.size + live.size - 2 * intersection;
	return symmetricDiff / unionSize;
}

/**
 * Minimum ink change before auto-transcribe enqueues again.
 * 0 = always enqueue when other gates pass; 1–95 = enqueue when Jaccard >= threshold/100.
 * Missing stored cells (never successfully transcribed with this fingerprint) always returns true.
 */
export function inkChangeMeetsAutoTranscribeThreshold(
	thresholdPercent: number,
	storedBboxCells: string | undefined,
	livePageData: InkFileData,
): boolean {
	const threshold = clampAutoTranscribeChangeThresholdPercent(thresholdPercent);
	if (!storedBboxCells) return true;
	if (threshold === 0) return true;
	const changeRatio = bboxCellsJaccardChangeRatio(storedBboxCells, livePageData);
	if (changeRatio === 0) return false;
	return changeRatio >= threshold / 100;
}

/** Clamps vault-synced slider values to 0..95 integer percent. */
export function clampAutoTranscribeChangeThresholdPercent(value: number): number {
	if (!Number.isFinite(value)) return 1;
	return Math.min(
		AUTO_TRANSCRIBE_CHANGE_THRESHOLD_MAX_PERCENT,
		Math.max(0, Math.round(value)),
	);
}

function parseBboxCellSet(serialized: string): Set<string> {
	if (!serialized) return new Set();
	return new Set(serialized.split(BBOX_CELL_SET_SEPARATOR).filter(Boolean));
}

function collectUniqueBboxCells(pageData: InkFileData): string[] {
	const points = collectWorldStrokePoints(pageData);
	if (points.length === 0) return [];
	let minX = Infinity;
	let minY = Infinity;
	for (const point of points) {
		if (point.x < minX) minX = point.x;
		if (point.y < minY) minY = point.y;
	}
	const unique = new Set<string>();
	for (const point of points) {
		const cellX = Math.floor((point.x - minX) / GRID_CELL_SIZE_PX);
		const cellY = Math.floor((point.y - minY) / GRID_CELL_SIZE_PX);
		unique.add(`${cellX},${cellY}`);
	}
	return [...unique].sort();
}

function collectWorldStrokePoints(pageData: InkFileData): { x: number; y: number }[] {
	const points: { x: number; y: number }[] = [];
	let strokes: InkStroke[] = [];
	if (isInkCanvasFile(pageData) && pageData.inkCanvas) {
		strokes = pageData.inkCanvas.strokes;
	} else {
		strokes = migrateFromTldraw(pageData.tldraw).strokes;
	}
	for (const stroke of strokes) {
		const offsetX = stroke.offset?.x ?? 0;
		const offsetY = stroke.offset?.y ?? 0;
		for (const point of stroke.points) {
			points.push({
				x: point[0] + offsetX,
				y: point[1] + offsetY,
			});
		}
	}
	return points;
}
