import { getStroke } from 'perfect-freehand';
import { getSvgPathFromStroke } from './utils/svg-path-from-stroke';
import { INK_CANVAS_FORMAT_VERSION, WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT } from 'src/constants';
import type { InkStroke, InkCanvasSnapshot } from './types';
import { toStrokeOptions } from './types';
///////////////////////////
///////////////////////////

/**
 * Render an array of strokes into a self-contained SVG string suitable for
 * saving as a `.svg` file. The viewBox is computed to tightly fit all strokes
 * with optional padding.
 */
export function renderStrokesToSvg(
	strokes: InkStroke[],
	snapshotJson: InkCanvasSnapshot,
	padding: number = 16,
): string {
	if (strokes.length === 0) {
		return buildSvgString('', '0 0 1 1', snapshotJson);
	}

	const bounds = computeStrokesBounds(strokes);
	const viewBox = [
		bounds.minX - padding,
		bounds.minY - padding,
		bounds.width + padding * 2,
		bounds.height + padding * 2,
	].join(' ');

	let pathsMarkup = '';
	for (const stroke of strokes) {
		const outlinePoints = getStroke(stroke.points, toStrokeOptions(stroke.style));
		const d = getSvgPathFromStroke(outlinePoints);
		const tx = stroke.offset.x;
		const ty = stroke.offset.y;

		const hasOffset = tx !== 0 || ty !== 0;
		if (hasOffset) {
			pathsMarkup += `<g transform="translate(${tx},${ty})">`;
			pathsMarkup += `<path d="${d}" fill="${stroke.style.color}" />`;
			pathsMarkup += `</g>\n`;
		} else {
			pathsMarkup += `<path d="${d}" fill="${stroke.style.color}" />\n`;
		}
	}

	return buildSvgString(pathsMarkup, viewBox, snapshotJson);
}

/**
 * Render writing strokes into a fixed-width SVG with horizontal guide lines.
 * Used for inkWriting file storage and embed preview.
 */
export function renderWritingStrokesToSvg(
	strokes: InkStroke[],
	snapshot: InkCanvasSnapshot,
	pageWidth: number,
	padding: number = 0,
): string {
	const lineHeight = snapshot.writingLineHeight ?? WRITING_LINE_HEIGHT;
	let height = WRITING_MIN_PAGE_HEIGHT;
	if (strokes.length > 0) {
		const bounds = computeStrokesBounds(strokes);
		const numFilledLines = Math.ceil((bounds.maxY + padding) / lineHeight);
		height = Math.max((numFilledLines + 0.5) * lineHeight, WRITING_MIN_PAGE_HEIGHT);
	}

	const margin = pageWidth * 0.05;
	let guideMarkup = '';
	const lineCount = Math.floor(height / lineHeight);
	for (let i = 1; i <= lineCount; i++) {
		const y = i * lineHeight;
		guideMarkup += `<line x1="${margin}" y1="${y}" x2="${pageWidth - margin}" y2="${y}" stroke="currentColor" stroke-opacity="0.5" />\n`;
	}

	let pathsMarkup = '';
	for (const stroke of strokes) {
		const outlinePoints = getStroke(stroke.points, toStrokeOptions(stroke.style));
		const d = getSvgPathFromStroke(outlinePoints);
		const tx = stroke.offset.x;
		const ty = stroke.offset.y;
		const hasOffset = tx !== 0 || ty !== 0;
		if (hasOffset) {
			pathsMarkup += `<g transform="translate(${tx},${ty})"><path d="${d}" fill="${stroke.style.color}" /></g>\n`;
		} else {
			pathsMarkup += `<path d="${d}" fill="${stroke.style.color}" />\n`;
		}
	}

	const viewBox = `0 0 ${pageWidth} ${height}`;
	return buildSvgString(guideMarkup + pathsMarkup, viewBox, snapshot);
}


// Building the full SVG document
///////////////////////////

function buildSvgString(
	pathsMarkup: string,
	viewBox: string,
	snapshotJson: InkCanvasSnapshot,
): string {
	const metadataJson = JSON.stringify(snapshotJson);

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
		`<metadata>`,
		`<ink-canvas version="${INK_CANVAS_FORMAT_VERSION}">${escapeXml(metadataJson)}</ink-canvas>`,
		`</metadata>`,
		pathsMarkup,
		`</svg>`,
	].join('\n');
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}


// Bounds calculation
///////////////////////////

export interface StrokeBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

export function computeStrokesBounds(strokes: InkStroke[]): StrokeBounds {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const stroke of strokes) {
		// Compute the outline to get the true rendered bounds
		const outlinePoints = getStroke(stroke.points, toStrokeOptions(stroke.style));

		for (const [px, py] of outlinePoints) {
			const x = px + stroke.offset.x;
			const y = py + stroke.offset.y;
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY,
	};
}
