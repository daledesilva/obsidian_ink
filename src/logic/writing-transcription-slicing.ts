import type { InkFileData } from 'src/components/formats/current/types/file-data';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import { HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES } from 'src/logic/almostuseful/handwriting-transcription-media-limit';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { stripWritingSvgToVisualOnly } from 'src/logic/utils/strip-writing-svg-to-visual-only';
import { utf8ByteLength } from 'src/logic/utils/utf8-byte-length';
import { getRenderedStrokeData } from 'src/ink-canvas/rendered-stroke-cache';
import { migrateFromTldraw } from 'src/ink-canvas/migrate-from-tldraw';
import { renderStrokesToSvg } from 'src/ink-canvas/svg-export';
import type { InkCanvasSnapshot, InkStroke } from 'src/ink-canvas/types';

//////////
//////////

/** Padding around a band's strokes so the model still sees ascenders and descenders. */
const SLICE_VERTICAL_PADDING_PX = 24;

/** Extra byte headroom per slice for the base64 envelope and JSON field names. */
const SLICE_BYTE_SAFETY_MARGIN = 4096;

export interface WritingTranscriptionSlice {
	/** Visual SVG for this band. Media prep still strips metadata and bakes the page. */
	svg: string;
	strokeCount: number;
}

export interface PlanWritingTranscriptionSlicesOptions {
	maxMediaBytes?: number;
}

interface StrokeVerticalBand {
	minY: number;
	maxY: number;
	strokes: InkStroke[];
}

/**
 * Groups strokes into visual rows by vertical overlap.
 *
 * A row of handwriting must never be cut across two requests: half a line produces
 * nonsense on both sides and cannot be stitched back. Overlapping bounding boxes are
 * treated as the same row, so words on one line stay together while separate ruled
 * lines (which do not overlap) become separate bands.
 */
function groupStrokesIntoVerticalBands(strokes: InkStroke[]): StrokeVerticalBand[] {
	const bands: StrokeVerticalBand[] = [];
	const sortedStrokes = [...strokes].sort(
		(left, right) => strokeWorldBounds(left).minY - strokeWorldBounds(right).minY,
	);
	for (const stroke of sortedStrokes) {
		const bounds = strokeWorldBounds(stroke);
		const currentBand = bands[bands.length - 1];
		const overlapsCurrentBand = currentBand !== undefined && bounds.minY <= currentBand.maxY;
		if (overlapsCurrentBand) {
			currentBand.maxY = Math.max(currentBand.maxY, bounds.maxY);
			currentBand.strokes.push(stroke);
			continue;
		}
		bands.push({ minY: bounds.minY, maxY: bounds.maxY, strokes: [stroke] });
	}
	return bands;
}

/** World-space bounds of one stroke, including its translate offset. */
function strokeWorldBounds(stroke: InkStroke): { minY: number; maxY: number } {
	const rendered = getRenderedStrokeData(stroke);
	const offsetY = stroke.offset?.y ?? 0;
	return {
		minY: rendered.bounds.minY + offsetY,
		maxY: rendered.bounds.maxY + offsetY,
	};
}

/** Resolves strokes and the writing snapshot regardless of storage engine. */
function readWritingStrokesAndSnapshot(
	pageData: InkFileData,
): { strokes: InkStroke[]; snapshot: InkCanvasSnapshot } | null {
	if (isInkCanvasFile(pageData) && pageData.inkCanvas) {
		return { strokes: pageData.inkCanvas.strokes, snapshot: pageData.inkCanvas };
	}
	const migrated = migrateFromTldraw(pageData.tldraw);
	return { strokes: migrated.strokes, snapshot: migrated };
}

/**
 * Byte length of the decoded media a slice SVG would produce.
 *
 * The portal caps the decoded payload, and SVG media travels as base64 of the UTF-8
 * document, so the document's own UTF-8 length is the number that matters.
 */
function estimateSliceMediaBytes(sliceSvg: string): number {
	return utf8ByteLength(sliceSvg);
}

/**
 * Renders one band's strokes as a self-contained, visual-only SVG whose viewBox hugs
 * that band.
 *
 * A hugging viewBox gives the model the same pixel budget per line that a short file
 * would get, which is what makes long pages transcribable at all. Metadata is stripped
 * here so the byte estimate below measures exactly what the portal receives.
 */
function buildBandSliceSvg(band: StrokeVerticalBand, snapshot: InkCanvasSnapshot): string {
	const sliceSnapshot: InkCanvasSnapshot = {
		...snapshot,
		strokes: band.strokes,
		camera: undefined,
	};
	// renderStrokesToSvg fits the viewBox to the strokes, so shift the strokes to a local
	// origin first: the band's page position is irrelevant once it is its own image.
	const localisedStrokes = band.strokes.map((stroke) => ({
		...stroke,
		offset: {
			x: stroke.offset?.x ?? 0,
			y: (stroke.offset?.y ?? 0) - band.minY + SLICE_VERTICAL_PADDING_PX,
		},
	}));
	const rendered = renderStrokesToSvg(localisedStrokes, sliceSnapshot, SLICE_VERTICAL_PADDING_PX);
	return stripWritingSvgToVisualOnly(rendered);
}

/**
 * Splits handwriting into ordered slices that each fit the portal cap.
 *
 * Called only after the full visual SVG was refused. The raw Ink file is not used as a
 * size check: it includes snapshot metadata the portal never receives. Returns null when
 * slicing would not produce a second request — drawings, a single visual row, or rows
 * that still pack into one slice — so the caller can JPEG that one image instead.
 */
export function planWritingTranscriptionSlices(
	writingSvgFileContent: string,
	options?: PlanWritingTranscriptionSlicesOptions,
): WritingTranscriptionSlice[] | null {
	const pageData = extractInkJsonFromSvg(writingSvgFileContent);
	if (!pageData) return null;
	// Only handwriting is sliced — a drawing has no line structure to cut on.
	if (pageData.meta.fileType !== 'inkWriting') return null;

	const writingData = readWritingStrokesAndSnapshot(pageData);
	if (!writingData || writingData.strokes.length === 0) return null;

	const maxMediaBytes =
		(options?.maxMediaBytes ?? HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES) - SLICE_BYTE_SAFETY_MARGIN;

	const bands = groupStrokesIntoVerticalBands(writingData.strokes);
	if (bands.length <= 1) return null;

	const slices: WritingTranscriptionSlice[] = [];
	let currentBandIndexes: number[] = [];
	for (let bandIndex = 0; bandIndex < bands.length; bandIndex += 1) {
		const candidateIndexes = [...currentBandIndexes, bandIndex];
		const candidateSvg = buildBandSliceSvg(
			mergeBands(bands, candidateIndexes),
			writingData.snapshot,
		);
		const fitsBudget = estimateSliceMediaBytes(candidateSvg) <= maxMediaBytes;
		if (fitsBudget || currentBandIndexes.length === 0) {
			currentBandIndexes = candidateIndexes;
			// A single band that already exceeds the cap stays its own slice: the portal
			// refuses it, and the caller retries that slice as a JPEG.
			if (!fitsBudget) {
				slices.push(toSlice(mergeBands(bands, currentBandIndexes), writingData.snapshot));
				currentBandIndexes = [];
			}
			continue;
		}
		slices.push(toSlice(mergeBands(bands, currentBandIndexes), writingData.snapshot));
		currentBandIndexes = [bandIndex];
	}
	if (currentBandIndexes.length > 0) {
		slices.push(toSlice(mergeBands(bands, currentBandIndexes), writingData.snapshot));
	}

	// One slice is the same request the portal already refused. The caller JPEGs that image.
	return slices.length > 1 ? slices : null;
}

function mergeBands(bands: StrokeVerticalBand[], bandIndexes: number[]): StrokeVerticalBand {
	const strokes: InkStroke[] = [];
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const bandIndex of bandIndexes) {
		const band = bands[bandIndex];
		strokes.push(...band.strokes);
		minY = Math.min(minY, band.minY);
		maxY = Math.max(maxY, band.maxY);
	}
	return { minY, maxY, strokes };
}

function toSlice(band: StrokeVerticalBand, snapshot: InkCanvasSnapshot): WritingTranscriptionSlice {
	return {
		svg: buildBandSliceSvg(band, snapshot),
		strokeCount: band.strokes.length,
	};
}

/** Joins slice transcripts in reading order without splitting words across seams. */
export function stitchWritingSliceTranscripts(sliceTranscripts: string[]): string {
	const nonEmpty = sliceTranscripts.map((text) => text.trim()).filter((text) => text.length > 0);
	if (nonEmpty.length === 0) return '';
	if (nonEmpty.length === 1) return nonEmpty[0];

	// A seam that lands mid-sentence must not become a paragraph break, so only join with
	// a newline when the previous slice finished a sentence.
	const SENTENCE_TERMINATOR = /[.!?:;]["')\]]?$/;
	let stitched = nonEmpty[0];
	for (let index = 1; index < nonEmpty.length; index += 1) {
		const separator = SENTENCE_TERMINATOR.test(stitched) ? '\n\n' : ' ';
		stitched = `${stitched}${separator}${nonEmpty[index]}`;
	}
	return stitched;
}
