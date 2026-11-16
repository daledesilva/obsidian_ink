/**
 * Builds handwriting and drawing SVGs that exceed the portal media cap by stacking
 * strokes from the existing fixtures. Run from the repo root:
 *
 *   npx tsx tests/fixtures/transcription-oversize/build-oversized-fixtures.ts
 *
 * These files are not live-eval samples. A real transcription would send several
 * portal jobs and spend credits.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { TLEditorSnapshot } from '@tldraw/tldraw';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import type { InkFileData } from 'src/components/formats/current/types/file-data';
import { WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES } from 'src/logic/almostuseful/handwriting-transcription-media-limit';
import { getRenderedStrokeData } from 'src/ink-canvas/rendered-stroke-cache';
import { renderStrokesToSvg, renderWritingStrokesToSvg } from 'src/ink-canvas/svg-export';
import type { InkCanvasSnapshot, InkStroke } from 'src/ink-canvas/types';
import { getInkStrokesFromSvg } from 'src/logic/utils/ink-file-has-strokes';
import { stripWritingSvgToVisualOnly } from 'src/logic/utils/strip-writing-svg-to-visual-only';
import { utf8ByteLength } from 'src/logic/utils/utf8-byte-length';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import {
	bakeOpaqueWritingBackground,
	resolveWritingSvgPageTheme,
	transcriptionBackgroundForTheme,
} from 'src/logic/utils/writing-svg-to-png-base64';

//////////
//////////

/** Gap between stacked copies so a line from one copy cannot merge into the next. */
const STACK_GAP_PX = 160;

/**
 * Drawings are one JPEG of the whole page, so copies sit in columns. A single
 * column of every copy is tens of thousands of pixels tall and the rasteriser
 * cannot hold it. Four columns keep the SVG over the cap and the JPEG canvas small.
 */
const DRAWING_COLUMN_COUNT = 4;
const DRAWING_COLUMN_WIDTH_PX = 1600;

const MAX_STACK_COPIES = 80;

const outputDir = __dirname;

const writingSources = [
	'../handwriting-transcription/long - multi-paragraph.svg',
	'../handwriting-transcription/short - single paragraph.svg',
	'../handwriting-transcription/short - multi-paragraph.svg',
	'../handwriting-transcription/short - bullets.svg',
];

const drawingSources = [
	'../../../qa-test-vault/fixtures/v2-tldraw-drawing-tasks-priority.svg',
	'../../../qa-test-vault/fixtures/drawing-fixture.svg',
];

/**
 * World-space vertical extent of a stroke, including its translate offset.
 */
function strokeVerticalExtent(stroke: InkStroke): { minY: number; maxY: number } {
	const rendered = getRenderedStrokeData(stroke);
	const offsetY = stroke.offset?.y ?? 0;
	return {
		minY: rendered.bounds.minY + offsetY,
		maxY: rendered.bounds.maxY + offsetY,
	};
}

/**
 * Moves a copy of one fixture's strokes so the group starts at `targetMinY`.
 * New ids keep each copy distinct inside one ink-canvas snapshot.
 */
/**
 * World-space horizontal extent of a stroke, including its translate offset.
 */
function strokeHorizontalExtent(stroke: InkStroke): { minX: number; maxX: number } {
	const rendered = getRenderedStrokeData(stroke);
	const offsetX = stroke.offset?.x ?? 0;
	return {
		minX: rendered.bounds.minX + offsetX,
		maxX: rendered.bounds.maxX + offsetX,
	};
}

function placeStrokeGroup(
	strokes: InkStroke[],
	targetMinX: number,
	targetMinY: number,
	copyIndex: number,
): { strokes: InkStroke[]; maxY: number } {
	let groupMinX = Number.POSITIVE_INFINITY;
	let groupMinY = Number.POSITIVE_INFINITY;
	let groupMaxY = Number.NEGATIVE_INFINITY;
	for (const stroke of strokes) {
		const vertical = strokeVerticalExtent(stroke);
		const horizontal = strokeHorizontalExtent(stroke);
		groupMinX = Math.min(groupMinX, horizontal.minX);
		groupMinY = Math.min(groupMinY, vertical.minY);
		groupMaxY = Math.max(groupMaxY, vertical.maxY);
	}
	const deltaX = targetMinX - groupMinX;
	const deltaY = targetMinY - groupMinY;
	const placed = strokes.map((stroke, strokeIndex) => ({
		...stroke,
		id: `${stroke.id}-copy-${copyIndex}-${strokeIndex}`,
		offset: {
			x: (stroke.offset?.x ?? 0) + deltaX,
			y: (stroke.offset?.y ?? 0) + deltaY,
		},
	}));
	return { strokes: placed, maxY: groupMaxY + deltaY };
}

/**
 * Decoded size of the visual SVG the portal would actually measure.
 */
function preparedMediaBytes(svgFileContent: string): number {
	const visualSvg = stripWritingSvgToVisualOnly(svgFileContent);
	const pageTheme = resolveWritingSvgPageTheme(visualSvg);
	const background = transcriptionBackgroundForTheme(pageTheme);
	const visualSvgWithPage = bakeOpaqueWritingBackground(visualSvg, background);
	return utf8ByteLength(visualSvgWithPage);
}

/**
 * Stacks fixture stroke groups until the prepared visual SVG is over the portal cap.
 */
async function stackUntilOverCap(
	groups: InkStroke[][],
	renderFile: (strokes: InkStroke[]) => string,
	columnCount: number,
): Promise<string> {
	const stacked: InkStroke[] = [];
	const columnCursorY = Array.from({ length: columnCount }, () => 0);
	let copyIndex = 0;
	let svgFileContent = '';
	while (copyIndex < MAX_STACK_COPIES) {
		for (const group of groups) {
			if (group.length === 0) continue;
			const columnIndex = copyIndex % columnCount;
			const placed = placeStrokeGroup(
				group,
				columnIndex * DRAWING_COLUMN_WIDTH_PX,
				columnCursorY[columnIndex],
				copyIndex,
			);
			stacked.push(...placed.strokes);
			columnCursorY[columnIndex] = placed.maxY + STACK_GAP_PX;
			copyIndex += 1;
			svgFileContent = renderFile(stacked);
			const bytes = preparedMediaBytes(svgFileContent);
			console.log(`copy ${copyIndex}: ${stacked.length} strokes, ${bytes} decoded bytes`);
			if (bytes > HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES) return svgFileContent;
		}
	}
	throw new Error(`Still under the media cap after ${MAX_STACK_COPIES} copies`);
}

/**
 * Reads strokes from one SVG fixture. Empty files are skipped by the stacker.
 */
function readStrokeGroup(relativePath: string): InkStroke[] {
	const svgFileContent = readFileSync(join(outputDir, relativePath), 'utf8');
	return getInkStrokesFromSvg(svgFileContent);
}

/**
 * Writes one ink-canvas SVG whose metadata file type matches the strokes.
 */
function renderInkFile(
	strokes: InkStroke[],
	fileType: 'inkWriting' | 'inkDrawing',
	writingLineHeight: number | undefined,
): string {
	const snapshot: InkCanvasSnapshot = {
		version: 1,
		strokes,
		gridEnabled: false,
		writingLineHeight,
	};
	let svgString: string;
	if (fileType === 'inkWriting') {
		// Ruled page, not a tight drawing viewBox, so stacked lines keep their gaps.
		svgString = renderWritingStrokesToSvg(strokes, snapshot, WRITING_PAGE_WIDTH);
	} else {
		svgString = renderStrokesToSvg(strokes, snapshot);
	}
	const pageData: InkFileData = {
		meta: {
			pluginVersion: '0.3.3',
			fileType,
			tldrawVersion: '',
			writingLineHeight,
		},
		tldraw: {} as TLEditorSnapshot,
		inkCanvas: snapshot,
		svgString,
	};
	return buildFileStr(pageData);
}

/**
 * Confirms the written file still parses as the intended type and is over the cap.
 */
async function assertOversized(svgFileContent: string, fileType: 'inkWriting' | 'inkDrawing'): Promise<void> {
	const pageData = extractInkJsonFromSvg(svgFileContent);
	if (!pageData || pageData.meta.fileType !== fileType) {
		throw new Error(`Expected ${fileType}, got ${pageData?.meta.fileType ?? 'unreadable'}`);
	}
	const bytes = preparedMediaBytes(svgFileContent);
	if (bytes <= HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES) {
		throw new Error(`${fileType} prepared media is ${bytes}, under the cap`);
	}
}

/**
 * Writes the two oversized fixtures used by the transcription size-cap test.
 */
async function buildOversizedFixtures(): Promise<void> {
	const writingGroups = writingSources.map(readStrokeGroup);
	const writingLineHeight = WRITING_LINE_HEIGHT;
	const writingSvg = await stackUntilOverCap(
		writingGroups,
		(strokes) => renderInkFile(strokes, 'inkWriting', writingLineHeight),
		1,
	);
	await assertOversized(writingSvg, 'inkWriting');
	const writingPath = join(outputDir, 'oversized - stacked writing.svg');
	writeFileSync(writingPath, writingSvg);
	console.log(`wrote ${writingPath}`);

	const drawingGroups = drawingSources.map(readStrokeGroup);
	const drawingSvg = await stackUntilOverCap(
		drawingGroups,
		(strokes) => renderInkFile(strokes, 'inkDrawing', undefined),
		DRAWING_COLUMN_COUNT,
	);
	await assertOversized(drawingSvg, 'inkDrawing');
	const drawingPath = join(outputDir, 'oversized - stacked drawing.svg');
	writeFileSync(drawingPath, drawingSvg);
	console.log(`wrote ${drawingPath}`);
}

buildOversizedFixtures().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
