import {
	assessPagePhoto,
	autoTuneAdjustmentAndSensitivity,
	pagePhotoToneForAdjustment,
	renderAdjustedPagePhoto,
	type PagePhotoAdjustment,
} from './adjust-page-photo';
import { flattenPageIlluminationImageDataInto } from './flatten-page-illumination';
import { instantiateZhangSuenWasm } from './load-skeleton-wasm';
import type { PhotoTraceWorkerRequest, PhotoTraceWorkerResponse } from './photo-trace-worker-protocol';
import {
	buildPhotoInkMask,
	PHOTO_TRACE_DEFAULT_INK_SENSITIVITY,
	photoTraceSauvolaK,
	setZhangSuenThinImpl,
	traceHandwritingFromRaster,
} from './trace-from-raster';
import { warpQuadToRgba } from './warp-page-quad';

//////////
//////////

let wasmReady: Promise<void> | null = null;

self.onmessage = (event: MessageEvent<PhotoTraceWorkerRequest>) => {
	const payload = event.data;
	void handleRequest(payload).catch((error: unknown) => {
		post({
			type: 'error',
			id: payload.id,
			message: error instanceof Error ? error.message : String(error),
		});
	});
};

async function handleRequest(payload: PhotoTraceWorkerRequest): Promise<void> {
	if (payload.type === 'init') {
		wasmReady = instantiateZhangSuenWasm(payload.wasmBytes).then((thin) => {
			setZhangSuenThinImpl(thin);
		});
		await wasmReady;
		post({ type: 'init-done', id: payload.id });
		return;
	}
	if (!wasmReady) {
		throw new Error('Zhang–Suen WASM is not loaded');
	}
	await wasmReady;

	if (payload.type === 'warp') {
		post({ type: 'progress', id: payload.id, stage: 'Straightening the page…' });
		const warped = warpQuadToRgba(
			payload.rgba,
			payload.width,
			payload.height,
			payload.corners,
			payload.maxEdgePx,
		);
		post({
			type: 'warp-done',
			id: payload.id,
			rgba: warped.data,
			width: warped.width,
			height: warped.height,
		});
		return;
	}

	if (payload.type === 'preview') {
		post({ type: 'preview-done', id: payload.id, ...buildPreview(payload) });
		return;
	}

	let pageRgba = payload.rgba;
	let pageWidth = payload.width;
	let pageHeight = payload.height;
	if (!payload.alreadyWarped) {
		post({ type: 'progress', id: payload.id, stage: 'Straightening the page…' });
		const warped = warpQuadToRgba(
			payload.rgba,
			payload.width,
			payload.height,
			payload.corners,
			payload.maxEdgePx,
		);
		const flattened = new ImageData(warped.data, warped.width, warped.height);
		// Lighting flatten once, on the pixels that will be traced.
		flattenPageIlluminationImageDataInto(flattened, flattened);
		pageRgba = flattened.data;
		pageWidth = warped.width;
		pageHeight = warped.height;
	}
	post({ type: 'progress', id: payload.id, stage: 'Tracing locally…' });
	const sourceImage = new ImageData(pageRgba, pageWidth, pageHeight);
	const assessment = assessPagePhoto(sourceImage);
	const adjusted = new ImageData(pageWidth, pageHeight);
	renderAdjustedPagePhoto(
		sourceImage,
		pagePhotoToneForAdjustment(assessment, payload.adjustment.lightInk),
		payload.adjustment,
		adjusted,
	);
	const gray = luminanceFromRgba(adjusted.data, pageWidth * pageHeight);
	const result = traceHandwritingFromRaster({
		width: pageWidth,
		height: pageHeight,
		gray,
		dropLargeBorderComponents: payload.dropLargeBorderComponents,
		simplifyEpsilon: payload.simplifyEpsilon,
		minPolylineLengthPx: payload.minPolylineLengthPx,
		sauvolaK: payload.sauvolaK,
		noiseCleanup: payload.noiseCleanup,
	});
	post({
		type: 'convert-done',
		id: payload.id,
		strokes: result.strokes,
		writingLineHeight: result.writingLineHeight,
		pageRgba: sourceImage.data,
		pageWidth,
		pageHeight,
	});
}

/**
 * Builds the black-and-white ink preview for the page step, and reports the detection
 * settings it used so the sliders start in the right place.
 *
 * This is the same pipeline the modal used to run on the UI thread: flatten the lighting,
 * assess the page, auto-tune (unless settings were supplied), apply them, then mask. Moving
 * it here is what lets the dialog open instantly with the plain photo.
 */
function buildPreview(payload: Extract<PhotoTraceWorkerRequest, { type: 'preview' }>): {
	maskRgba: Uint8ClampedArray;
	width: number;
	height: number;
	adjustment: PagePhotoAdjustment;
	inkSensitivity: number;
} {
	const source = new ImageData(payload.rgba, payload.width, payload.height);
	flattenPageIlluminationImageDataInto(source, source);
	const assessment = assessPagePhoto(source);

	let adjustment: PagePhotoAdjustment;
	let inkSensitivity: number;
	if (payload.adjustment) {
		adjustment = payload.adjustment;
		inkSensitivity = payload.inkSensitivity ?? PHOTO_TRACE_DEFAULT_INK_SENSITIVITY;
	} else {
		const tuned = autoTuneAdjustmentAndSensitivity(source, assessment, assessment.lightInk);
		adjustment = tuned.adjustment;
		inkSensitivity = tuned.inkSensitivity;
	}

	const adjusted = new ImageData(payload.width, payload.height);
	renderAdjustedPagePhoto(
		source,
		pagePhotoToneForAdjustment(assessment, adjustment.lightInk),
		adjustment,
		adjusted,
	);
	const gray = luminanceFromRgba(adjusted.data, payload.width * payload.height);
	const mask = buildPhotoInkMask(
		gray,
		payload.width,
		payload.height,
		photoTraceSauvolaK(inkSensitivity),
		true,
		payload.noiseCleanup ?? true,
	);
	const maskRgba = new Uint8ClampedArray(payload.width * payload.height * 4);
	for (let index = 0; index < mask.length; index++) {
		const ink = mask[index] === 1 ? 0 : 255;
		const offset = index * 4;
		maskRgba[offset] = ink;
		maskRgba[offset + 1] = ink;
		maskRgba[offset + 2] = ink;
		maskRgba[offset + 3] = 255;
	}
	return {
		maskRgba,
		width: payload.width,
		height: payload.height,
		adjustment,
		inkSensitivity,
	};
}

function luminanceFromRgba(data: Uint8ClampedArray, pixelCount: number): Uint8Array {
	const gray = new Uint8Array(pixelCount);
	for (let i = 0; i < pixelCount; i++) {
		const r = data[i * 4];
		const g = data[i * 4 + 1];
		const b = data[i * 4 + 2];
		gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
	}
	return gray;
}

function post(message: PhotoTraceWorkerResponse): void {
	self.postMessage(message);
}
