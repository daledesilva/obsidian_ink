import type { InkFileData } from 'src/components/formats/current/types/file-data';
import type { InkStroke } from 'src/ink-canvas/types';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import { migrateFromTldraw } from 'src/ink-canvas/migrate-from-tldraw';

//////////
//////////

const SVG_CONTENT_HASH_VERSION = 'v1';
const SVG_CONTENT_HASH_KIND = 'simhash64';
export const SVG_CONTENT_HASH_PREFIX = `${SVG_CONTENT_HASH_VERSION}:${SVG_CONTENT_HASH_KIND}:`;
const SIMHASH_BITS = 64;
/** Coarse grid so nearby points collide; Hamming distance then reflects ink layout, not raw point jitter. */
const GRID_CELL_SIZE_PX = 32;

/**
 * Returns true when the ink file has at least one stroke point to transcribe.
 */
export function inkFileHasStrokes(pageData: InkFileData): boolean {
	return collectQuantizedGridCells(pageData).length > 0;
}

/**
 * 64-bit SimHash of stroke geometry (not transcript text, theme, or metadata).
 */
export function computeSvgContentHash(pageData: InkFileData): string {
	const cells = collectQuantizedGridCells(pageData);
	const digest = simhash64(cells);
	return `${SVG_CONTENT_HASH_PREFIX}${digest.toString(16).padStart(16, '0')}`;
}

/**
 * Fraction of SimHash bits that differ (0 identical, 1 fully different).
 * Incomparable versions return 1 so callers re-hash instead of skipping.
 */
export function svgContentHashHammingRatio(hashA: string, hashB: string): number {
	const bitsA = parseSimhash64(hashA);
	const bitsB = parseSimhash64(hashB);
	if (bitsA === null || bitsB === null) return 1;
	const zero = BigInt(0);
	const one = BigInt(1);
	let xor = bitsA ^ bitsB;
	let differentBitCount = 0;
	while (xor !== zero) {
		xor &= xor - one;
		differentBitCount += 1;
	}
	return differentBitCount / SIMHASH_BITS;
}

function parseSimhash64(hash: string): bigint | null {
	if (!hash.startsWith(SVG_CONTENT_HASH_PREFIX)) return null;
	const hex = hash.slice(SVG_CONTENT_HASH_PREFIX.length);
	if (!/^[0-9a-f]{16}$/i.test(hex)) return null;
	return BigInt(`0x${hex}`);
}

function collectQuantizedGridCells(pageData: InkFileData): string[] {
	const cells: string[] = [];
	let strokes: InkStroke[] = [];
	if (isInkCanvasFile(pageData) && pageData.inkCanvas) {
		strokes = pageData.inkCanvas.strokes;
	} else {
		strokes = migrateFromTldraw(pageData.tldraw).strokes;
	}
	for (const stroke of strokes) {
		appendInkCanvasStrokeCells(stroke, cells);
	}
	return cells;
}

function appendInkCanvasStrokeCells(stroke: InkStroke, cells: string[]): void {
	const offsetX = stroke.offset?.x ?? 0;
	const offsetY = stroke.offset?.y ?? 0;
	for (const point of stroke.points) {
		const x = point[0] + offsetX;
		const y = point[1] + offsetY;
		cells.push(gridCellKey(x, y));
	}
}

function gridCellKey(x: number, y: number): string {
	const cellX = Math.floor(x / GRID_CELL_SIZE_PX);
	const cellY = Math.floor(y / GRID_CELL_SIZE_PX);
	return `${cellX},${cellY}`;
}

function simhash64(features: string[]): bigint {
	const counts = new Array<number>(SIMHASH_BITS).fill(0);
	const one = BigInt(1);
	const zero = BigInt(0);
	for (const feature of features) {
		const featureHash = fnv1a64(feature);
		for (let bitIndex = 0; bitIndex < SIMHASH_BITS; bitIndex++) {
			const bitOn = ((featureHash >> BigInt(bitIndex)) & one) === one;
			if (bitOn) {
				counts[bitIndex] += 1;
			} else {
				counts[bitIndex] -= 1;
			}
		}
	}
	let digest = zero;
	for (let bitIndex = 0; bitIndex < SIMHASH_BITS; bitIndex++) {
		if (counts[bitIndex] >= 0) {
			digest |= one << BigInt(bitIndex);
		}
	}
	return digest;
}

const FNV_OFFSET_BASIS_64 = BigInt('0xcbf29ce484222325');
const FNV_PRIME_64 = BigInt('0x100000001b3');
const MASK_64 = BigInt('0xffffffffffffffff');

function fnv1a64(value: string): bigint {
	let hash = FNV_OFFSET_BASIS_64;
	for (let index = 0; index < value.length; index++) {
		hash ^= BigInt(value.charCodeAt(index));
		hash = (hash * FNV_PRIME_64) & MASK_64;
	}
	return hash;
}
