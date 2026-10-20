import {
	assessPagePhoto,
	pagePhotoToneForAdjustment,
	renderAdjustedPagePhoto,
} from './adjust-page-photo';
import { flattenPageIlluminationImageDataInto } from './flatten-page-illumination';
import { instantiateZhangSuenWasm } from './load-skeleton-wasm';
import type { PhotoTraceWorkerRequest, PhotoTraceWorkerResponse } from './photo-trace-worker-protocol';
import {
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

	post({ type: 'progress', id: payload.id, stage: 'Straightening the page…' });
	const warped = warpQuadToRgba(
		payload.rgba,
		payload.width,
		payload.height,
		payload.corners,
		payload.maxEdgePx,
	);
	post({ type: 'progress', id: payload.id, stage: 'Tracing locally…' });
	const sourceImage = new ImageData(warped.data, warped.width, warped.height);
	flattenPageIlluminationImageDataInto(sourceImage, sourceImage);
	const assessment = assessPagePhoto(sourceImage);
	const adjusted = new ImageData(warped.width, warped.height);
	renderAdjustedPagePhoto(
		sourceImage,
		pagePhotoToneForAdjustment(assessment, payload.adjustment.lightInk),
		payload.adjustment,
		adjusted,
	);
	const gray = luminanceFromRgba(adjusted.data, warped.width * warped.height);
	const result = traceHandwritingFromRaster({
		width: warped.width,
		height: warped.height,
		gray,
		dropLargeBorderComponents: payload.dropLargeBorderComponents,
		simplifyEpsilon: payload.simplifyEpsilon,
		minPolylineLengthPx: payload.minPolylineLengthPx,
	});
	post({
		type: 'convert-done',
		id: payload.id,
		strokes: result.strokes,
		writingLineHeight: result.writingLineHeight,
		pageRgba: sourceImage.data,
		pageWidth: warped.width,
		pageHeight: warped.height,
	});
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
