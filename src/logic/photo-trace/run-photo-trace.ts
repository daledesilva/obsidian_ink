import { PHOTO_TRACE_WORKING_MAX_EDGE_PX } from './trace-from-raster';

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
 * Object URL of the working canvas so the pin dialog and the warp share the same pixels.
 */
export function canvasJpegObjectUrl(canvas: HTMLCanvasElement, quality = 0.8): Promise<string> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error('Could not preview the photo'));
				return;
			}
			resolve(URL.createObjectURL(blob));
		}, 'image/jpeg', quality);
	});
}

export function imageDataFromCanvas(canvas: HTMLCanvasElement): ImageData {
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Could not read the photo');
	return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function canvasFromRgba(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Could not paint the page photo');
	context.putImageData(new ImageData(rgba, width, height), 0, 0);
	return canvas;
}

/**
 * Shrinks ImageData so its long edge is at most maxEdgePx. Used by the adjust preview.
 */
export function scaleImageDataToMaxEdge(image: ImageData, maxEdgePx: number): ImageData {
	const longEdge = Math.max(image.width, image.height);
	if (longEdge <= maxEdgePx) return image;
	const scale = maxEdgePx / longEdge;
	const width = Math.max(1, Math.round(image.width * scale));
	const height = Math.max(1, Math.round(image.height * scale));
	const source = canvasFromRgba(image.data, image.width, image.height);
	const scaled = document.createElement('canvas');
	scaled.width = width;
	scaled.height = height;
	const context = scaled.getContext('2d');
	if (!context) throw new Error('Could not scale the page photo');
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';
	context.drawImage(source, 0, 0, width, height);
	return context.getImageData(0, 0, width, height);
}

/**
 * Luminance raster from a canvas. Colour is ignored so any paper colour can trace.
 */
export function luminanceFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
	const imageData = imageDataFromCanvas(canvas);
	const gray = new Uint8Array(canvas.width * canvas.height);
	for (let i = 0; i < gray.length; i++) {
		const r = imageData.data[i * 4];
		const g = imageData.data[i * 4 + 1];
		const b = imageData.data[i * 4 + 2];
		gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
	}
	return gray;
}
