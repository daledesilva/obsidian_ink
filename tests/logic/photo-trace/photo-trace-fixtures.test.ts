import { createCanvas, ImageData as CanvasImageData, loadImage } from '@napi-rs/canvas';
import { existsSync, readFileSync } from 'fs';
import { WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { flattenPageIlluminationImageData } from 'src/logic/photo-trace/flatten-page-illumination';
import {
	findPageQuad,
	quadMatchesFullFrame,
	type PagePoint,
} from 'src/logic/photo-trace/find-page-quad';
import {
	PHOTO_TRACE_DEFAULT_DETAIL,
	photoTraceMinPolylineLength,
	photoTraceSauvolaK,
	photoTraceSimplifyEpsilon,
	setZhangSuenThinImpl,
	traceHandwritingFromRaster,
	zhangSuenThinJs,
	autoSelectPhotoInkSensitivity,
} from 'src/logic/photo-trace/trace-from-raster';
import { warpQuadToRgba } from 'src/logic/photo-trace/warp-page-quad';
import type { InkStroke } from 'src/ink-canvas/types';
import {
	getPhotoTraceFixture,
	listPhotoTraceFixtures,
	PHOTO_TRACE_FIXTURE_IDS,
	type PhotoTraceFixture,
} from '../../fixtures/photo-trace/fixtures';

//////////
//////////

jest.mock('nanoid', () => {
	let nextId = 0;
	return {
		nanoid: () => {
			nextId += 1;
			return `photo-trace-fixture-${nextId}`;
		},
	};
});

/** Long edge of the photo the quad and warp read. Full phone pixels make Zhang–Suen too slow for unit tests. */
const FIXTURE_SOURCE_MAX_EDGE_PX = 720;
/** Long edge of the straightened page that is actually traced. */
const FIXTURE_WARP_MAX_EDGE_PX = 480;

interface DecodedPhoto {
	rgba: Uint8ClampedArray;
	gray: Uint8Array;
	width: number;
	height: number;
}

describe('photo trace fixtures', () => {
	beforeAll(() => {
		// jsdom in this repo does not provide ImageData. Flatten builds one, so use the Node canvas class.
		globalThis.ImageData = CanvasImageData as unknown as typeof ImageData;
		// Convert uses WASM. These tests use the JS reference thinner on a small page.
		setZhangSuenThinImpl(zhangSuenThinJs);
	});

	test('registers each handwritten page photo on disk', () => {
		expect(PHOTO_TRACE_FIXTURE_IDS).toEqual([
			'white-page-1',
			'white-page-2',
			'lined-page',
			'lined-rotated-shadowed-page',
			'brown-shadowed-page',
		]);
		const fixtures = listPhotoTraceFixtures();
		expect(fixtures).toHaveLength(PHOTO_TRACE_FIXTURE_IDS.length);
		for (const fixture of fixtures) {
			expect(existsSync(fixture.filePath)).toBe(true);
			expect(readFileSync(fixture.filePath).subarray(0, 3).toString('latin1')).toBe('\xff\xd8\xff');
			expect(fixture.filePath.endsWith(fixture.fileName)).toBe(true);
		}
		expect(getPhotoTraceFixture('lined-page').pageOrientation).toBe('portrait');
		expect(getPhotoTraceFixture('lined-rotated-shadowed-page').hasCrossingShadow).toBe(true);
	});

	test.each(PHOTO_TRACE_FIXTURE_IDS)(
		'%s finds the page and traces handwriting',
		async (fixtureId) => {
			const fixture = getPhotoTraceFixture(fixtureId);
			const photo = await decodePhotoTraceFixture(fixture, FIXTURE_SOURCE_MAX_EDGE_PX);
			const isSourceLandscape = photo.width > photo.height;
			expect(isSourceLandscape).toBe(fixture.pageOrientation === 'landscape');

			const detected = findPageQuad(photo.gray, photo.width, photo.height, photo.rgba);
			expect(detected).not.toBeNull();
			if (!detected) return;
			const corners = detected.corners;
			const isFullFrame = quadMatchesFullFrame(corners, photo.width, photo.height);
			expect(isFullFrame).toBe(false);
			const areaRatio = Math.abs(polygonArea(corners)) / (photo.width * photo.height);
			expect(areaRatio).toBeGreaterThan(0.2);
			expect(areaRatio).toBeLessThan(0.94);

			const warped = warpQuadToRgba(
				photo.rgba,
				photo.width,
				photo.height,
				corners,
				FIXTURE_WARP_MAX_EDGE_PX,
			);
			const isWarpedLandscape = warped.width > warped.height;
			expect(isWarpedLandscape).toBe(fixture.pageOrientation === 'landscape');

			const flattened = flattenPageIlluminationImageData(
				new ImageData(warped.data, warped.width, warped.height),
			);
			const gray = grayscaleFromRgba(flattened.data, flattened.width * flattened.height);
			const inkSensitivity = autoSelectPhotoInkSensitivity(gray, flattened.width, flattened.height);
			const traced = traceHandwritingFromRaster({
				width: flattened.width,
				height: flattened.height,
				gray,
				dropLargeBorderComponents: true,
				simplifyEpsilon: photoTraceSimplifyEpsilon(PHOTO_TRACE_DEFAULT_DETAIL),
				minPolylineLengthPx: photoTraceMinPolylineLength(PHOTO_TRACE_DEFAULT_DETAIL),
				sauvolaK: photoTraceSauvolaK(inkSensitivity),
				noiseCleanup: true,
			});

			expect(traced.writingLineHeight).toBe(WRITING_LINE_HEIGHT);
			const pointCount = countStrokePoints(traced.strokes);
			// Floors sit well under the pages measured at this size (sparsest page was about 320 strokes).
			expect(traced.strokes.length).toBeGreaterThan(200);
			expect(pointCount).toBeGreaterThan(600);
			expect(strokesStayOnPage(traced.strokes)).toBe(true);

			if (fixture.hasCrossingShadow) {
				const leftPoints = countPointsOnRasterSide(traced.strokes, warped.width, warped.height, 'left');
				const rightPoints = countPointsOnRasterSide(traced.strokes, warped.width, warped.height, 'right');
				expect(leftPoints).toBeGreaterThan(80);
				expect(rightPoints).toBeGreaterThan(80);
			}
		},
		120_000,
	);
});

/** Loads a fixture JPEG and shrinks its long edge so the trace stays inside the unit-test budget. */
async function decodePhotoTraceFixture(
	fixture: PhotoTraceFixture,
	maxEdgePx: number,
): Promise<DecodedPhoto> {
	const image = await loadImage(fixture.filePath);
	const longEdge = Math.max(image.width, image.height);
	const scale = longEdge > maxEdgePx ? maxEdgePx / longEdge : 1;
	const width = Math.max(1, Math.round(image.width * scale));
	const height = Math.max(1, Math.round(image.height * scale));
	const canvas = createCanvas(width, height);
	const context = canvas.getContext('2d');
	context.drawImage(image, 0, 0, width, height);
	const imageData = context.getImageData(0, 0, width, height);
	const rgba = new Uint8ClampedArray(imageData.data);
	return {
		rgba,
		gray: grayscaleFromRgba(rgba, width * height),
		width,
		height,
	};
}

/** Rec. 601 luminance, matching the photo-trace worker. */
function grayscaleFromRgba(rgba: Uint8ClampedArray, pixelCount: number): Uint8Array {
	const gray = new Uint8Array(pixelCount);
	for (let index = 0; index < pixelCount; index++) {
		const offset = index * 4;
		gray[index] = Math.round(
			0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2],
		);
	}
	return gray;
}

/** Shoelace area of the detected page quad. */
function polygonArea(corners: [PagePoint, PagePoint, PagePoint, PagePoint]): number {
	let sum = 0;
	for (let index = 0; index < corners.length; index++) {
		const current = corners[index];
		const next = corners[(index + 1) % corners.length];
		sum += current.x * next.y - next.x * current.y;
	}
	return sum / 2;
}

/** Total centreline samples across the traced page. */
function countStrokePoints(strokes: InkStroke[]): number {
	let count = 0;
	for (const stroke of strokes) count += stroke.points.length;
	return count;
}

/** True when every sample is finite and sits on the writing page. */
function strokesStayOnPage(strokes: InkStroke[]): boolean {
	for (const stroke of strokes) {
		for (const point of stroke.points) {
			const x = point[0];
			const y = point[1];
			const isOnPage = Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= WRITING_PAGE_WIDTH && y >= 0;
			if (!isOnPage) return false;
		}
	}
	return true;
}

/**
 * Counts samples in the left or right third of the straightened page.
 * A crossing shadow that deletes one side fails this.
 */
function countPointsOnRasterSide(
	strokes: InkStroke[],
	rasterWidth: number,
	rasterHeight: number,
	side: 'left' | 'right',
): number {
	const margin = WRITING_PAGE_WIDTH * 0.05;
	const contentWidth = WRITING_PAGE_WIDTH - margin * 2;
	const scale = Math.min(contentWidth / Math.max(1, rasterWidth), contentWidth / Math.max(1, rasterHeight));
	const offsetX = margin + (contentWidth - rasterWidth * scale) / 2;
	const leftLimit = offsetX + rasterWidth * scale * 0.33;
	const rightLimit = offsetX + rasterWidth * scale * 0.67;
	let count = 0;
	for (const stroke of strokes) {
		for (const point of stroke.points) {
			const x = point[0];
			if (side === 'left' && x < leftLimit) count += 1;
			if (side === 'right' && x > rightLimit) count += 1;
		}
	}
	return count;
}
