import type InkPlugin from 'src/main';
import type { PhotoTraceRasterInput, PhotoTraceResult } from './trace-from-raster';
import { PHOTO_TRACE_WORKING_MAX_EDGE_PX, traceHandwritingFromRaster } from './trace-from-raster';
import type { PhotoTraceWorkerRequest, PhotoTraceWorkerResponse } from './photo-trace.worker';

//////////
//////////

/**
 * Decodes a photo blob onto a canvas with the long edge capped for tracing.
 * The vault JPEG stays smaller; this canvas is the working copy the pins and
 * the tracer read.
 */
export async function decodePhotoToCanvas(
	blob: Blob,
	maxEdgePx = PHOTO_TRACE_WORKING_MAX_EDGE_PX,
): Promise<HTMLCanvasElement> {
	const bitmap = await createImageBitmap(blob);
	const longEdge = Math.max(bitmap.width, bitmap.height);
	const scale = longEdge > maxEdgePx ? maxEdgePx / longEdge : 1;
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) {
		bitmap.close();
		throw new Error('Could not create canvas for photo trace');
	}
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();
	return canvas;
}

/**
 * Luminance raster from a canvas. Colour is ignored so any paper colour can trace.
 */
export function luminanceFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Could not read the photo');
	const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
	const gray = new Uint8Array(canvas.width * canvas.height);
	for (let i = 0; i < gray.length; i++) {
		const r = imageData.data[i * 4];
		const g = imageData.data[i * 4 + 1];
		const b = imageData.data[i * 4 + 2];
		gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
	}
	return gray;
}

/**
 * Shrinks a canvas so its long edge is at most maxEdgePx. Used by the Resolution slider.
 */
export function scaleCanvasToMaxEdge(canvas: HTMLCanvasElement, maxEdgePx: number): HTMLCanvasElement {
	const longEdge = Math.max(canvas.width, canvas.height);
	if (longEdge <= maxEdgePx) return canvas;
	const scale = maxEdgePx / longEdge;
	const width = Math.max(1, Math.round(canvas.width * scale));
	const height = Math.max(1, Math.round(canvas.height * scale));
	const scaled = document.createElement('canvas');
	scaled.width = width;
	scaled.height = height;
	const context = scaled.getContext('2d');
	if (!context) throw new Error('Could not scale the page photo');
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';
	context.drawImage(canvas, 0, 0, width, height);
	return scaled;
}

/**
 * Runs handwriting trace off the UI thread when a worker bundle is available.
 */
export async function runPhotoTrace(
	plugin: InkPlugin,
	raster: PhotoTraceRasterInput,
): Promise<PhotoTraceResult> {
	const workerUrl = getPhotoTraceWorkerUrl(plugin);
	if (workerUrl) {
		try {
			return await runPhotoTraceInWorker(workerUrl, raster);
		} catch {
			// Fall back to main thread when the worker fails to load.
		}
	}
	return traceHandwritingFromRaster(raster);
}

function getPhotoTraceWorkerUrl(plugin: InkPlugin): string | null {
	try {
		const adapter = plugin.app.vault.adapter as { getResourcePath?: (path: string) => string };
		if (!adapter.getResourcePath) return null;
		return adapter.getResourcePath(
			`plugins/${plugin.manifest.id}/logic/photo-trace/photo-trace.worker.js`,
		);
	} catch {
		return null;
	}
}

function runPhotoTraceInWorker(
	workerUrl: string,
	raster: PhotoTraceRasterInput,
): Promise<PhotoTraceResult> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(workerUrl);
		const id = crypto.randomUUID();
		const request: PhotoTraceWorkerRequest = {
			id,
			width: raster.width,
			height: raster.height,
			gray: raster.gray,
			dropLargeBorderComponents: raster.dropLargeBorderComponents,
			simplifyEpsilon: raster.simplifyEpsilon,
			minPolylineLengthPx: raster.minPolylineLengthPx,
		};
		const timeoutId = window.setTimeout(() => {
			worker.terminate();
			reject(new Error('Photo trace timed out'));
		}, 120_000);
		worker.onmessage = (event: MessageEvent<PhotoTraceWorkerResponse>) => {
			if (event.data.id !== id) return;
			window.clearTimeout(timeoutId);
			worker.terminate();
			resolve({
				strokes: event.data.strokes,
				writingLineHeight: event.data.writingLineHeight,
			});
		};
		worker.onerror = (error) => {
			window.clearTimeout(timeoutId);
			worker.terminate();
			reject(error);
		};
		worker.postMessage(request);
	});
}
