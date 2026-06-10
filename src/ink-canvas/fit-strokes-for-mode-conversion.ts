import {
	WRITING_LINE_HEIGHT,
	WRITING_MIN_PAGE_HEIGHT,
	WRITING_PAGE_WIDTH,
} from 'src/constants';
import { computeStrokesBounds } from './svg-export';
import type { InkPoint, InkStroke } from './types';

///////////////////////////
///////////////////////////

function cloneStrokes(strokes: InkStroke[]): InkStroke[] {
	return strokes.map((stroke) => ({
		...stroke,
		points: stroke.points.map((point) => [...point] as InkPoint),
		style: { ...stroke.style },
		offset: { x: stroke.offset.x, y: stroke.offset.y },
	}));
}

function transformStroke(
	stroke: InkStroke,
	scale: number,
	translateX: number,
	translateY: number,
): InkStroke {
	return {
		...stroke,
		points: stroke.points.map(([x, y, pressure]) => [
			x * scale,
			y * scale,
			pressure,
		]),
		offset: {
			x: stroke.offset.x * scale + translateX,
			y: stroke.offset.y * scale + translateY,
		},
		style: {
			...stroke.style,
			size: stroke.style.size * scale,
		},
	};
}

function computeDrawingToWritingScale(
	strokes: InkStroke[],
	writingLineHeight: number,
	pageWidth: number,
): number {
	const bounds = computeStrokesBounds(strokes);
	if (bounds.width <= 0 || bounds.height <= 0) return 1;

	const margin = pageWidth * 0.05;
	const contentWidth = pageWidth - 2 * margin;
	const topY = writingLineHeight * 0.5;

	let scale = Math.min(contentWidth / bounds.width, 1);

	const projectedMaxY = topY + bounds.height * scale;
	const invitingPageHeight = Math.max(
		(Math.ceil(projectedMaxY / writingLineHeight) + 0.5) * writingLineHeight,
		WRITING_MIN_PAGE_HEIGHT,
	);
	const maxContentHeight = invitingPageHeight - topY;
	if (bounds.height * scale > maxContentHeight) {
		scale = Math.min(scale, maxContentHeight / bounds.height);
	}

	return scale;
}

/**
 * Returns the uniform scale that would be applied when fitting drawing strokes
 * into a writing page (1 = no change, values below 1 = shrink only).
 */
export function previewDrawingToWritingScale(
	strokes: InkStroke[],
	writingLineHeight: number = WRITING_LINE_HEIGHT,
	pageWidth: number = WRITING_PAGE_WIDTH,
): number {
	if (strokes.length === 0) return 1;
	return computeDrawingToWritingScale(strokes, writingLineHeight, pageWidth);
}

/**
 * Scale (shrink only) and reposition ink-canvas drawing strokes to fit the
 * writing page content area: horizontal margins, top-aligned below first line.
 */
export function fitStrokesForDrawingToWriting(
	strokes: InkStroke[],
	writingLineHeight: number = WRITING_LINE_HEIGHT,
	pageWidth: number = WRITING_PAGE_WIDTH,
): InkStroke[] {
	if (strokes.length === 0) return [];

	const bounds = computeStrokesBounds(strokes);
	if (bounds.width <= 0 || bounds.height <= 0) {
		return cloneStrokes(strokes);
	}

	const margin = pageWidth * 0.05;
	const contentWidth = pageWidth - 2 * margin;
	const topY = writingLineHeight * 0.5;
	const scale = computeDrawingToWritingScale(strokes, writingLineHeight, pageWidth);

	const translateX = margin + (contentWidth - bounds.width * scale) / 2 - bounds.minX * scale;
	const translateY = topY - bounds.minY * scale;

	return cloneStrokes(strokes).map((stroke) =>
		transformStroke(stroke, scale, translateX, translateY),
	);
}

/**
 * Writing strokes are already in page coordinates — no geometric change on write→draw.
 * Embed viewBox fitting is handled when updating note embed lines.
 */
export function fitStrokesForWritingToDrawing(strokes: InkStroke[]): InkStroke[] {
	return cloneStrokes(strokes);
}
