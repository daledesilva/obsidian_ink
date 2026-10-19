import type { PagePoint } from './find-page-quad';
import { HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES } from 'src/logic/almostuseful/handwriting-transcription-media-limit';
import { PHOTO_TRACE_WORKING_MAX_EDGE_PX } from './trace-from-raster';

//////////
//////////

const WARP_MAX_EDGE_PX = PHOTO_TRACE_WORKING_MAX_EDGE_PX;

/**
 * Perspective-warps a quadrilateral to a straight page bitmap.
 */
export function warpQuadToCanvas(
	source: HTMLCanvasElement,
	corners: [PagePoint, PagePoint, PagePoint, PagePoint],
): HTMLCanvasElement {
	const [topLeft, topRight, bottomRight, bottomLeft] = corners;
	const widthTop = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
	const widthBottom = Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y);
	const heightLeft = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
	const heightRight = Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y);
	let outWidth = Math.max(1, Math.round(Math.max(widthTop, widthBottom)));
	let outHeight = Math.max(1, Math.round(Math.max(heightLeft, heightRight)));
	const longEdge = Math.max(outWidth, outHeight);
	if (longEdge > WARP_MAX_EDGE_PX) {
		const scale = WARP_MAX_EDGE_PX / longEdge;
		outWidth = Math.max(1, Math.round(outWidth * scale));
		outHeight = Math.max(1, Math.round(outHeight * scale));
	}
	const homography = homographyDestToSource(corners, outWidth, outHeight);
	const sourceContext = source.getContext('2d');
	if (!sourceContext) throw new Error('Could not read the photo');
	const sourceData = sourceContext.getImageData(0, 0, source.width, source.height);
	const dest = document.createElement('canvas');
	dest.width = outWidth;
	dest.height = outHeight;
	const destContext = dest.getContext('2d');
	if (!destContext) throw new Error('Could not warp the page');
	const destData = destContext.createImageData(outWidth, outHeight);
	for (let y = 0; y < outHeight; y++) {
		for (let x = 0; x < outWidth; x++) {
			const sourcePoint = applyHomography(homography, x, y);
			const pixel = sampleBilinear(
				sourceData.data,
				source.width,
				source.height,
				sourcePoint.x,
				sourcePoint.y,
			);
			const offset = (y * outWidth + x) * 4;
			destData.data[offset] = pixel[0];
			destData.data[offset + 1] = pixel[1];
			destData.data[offset + 2] = pixel[2];
			destData.data[offset + 3] = 255;
		}
	}
	destContext.putImageData(destData, 0, 0);
	return dest;
}

/**
 * JPEG bytes for the warped page, kept under the transcription size cap.
 */
export async function encodeCanvasJpeg(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
	let quality = 0.85;
	let lastBuffer: ArrayBuffer | null = null;
	while (quality >= 0.35) {
		const encoded = await canvasToJpegArrayBuffer(canvas, quality);
		lastBuffer = encoded;
		if (encoded.byteLength <= HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES) return encoded;
		quality -= 0.1;
	}
	if (lastBuffer) return lastBuffer;
	throw new Error('Cropped photo is too large to save');
}

function canvasToJpegArrayBuffer(canvas: HTMLCanvasElement, quality: number): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((jpegBlob) => {
			if (!jpegBlob) {
				reject(new Error('Could not encode JPEG'));
				return;
			}
			void jpegBlob.arrayBuffer().then(resolve).catch(reject);
		}, 'image/jpeg', quality);
	});
}

function homographyDestToSource(
	corners: [PagePoint, PagePoint, PagePoint, PagePoint],
	outWidth: number,
	outHeight: number,
): number[] {
	const destination: PagePoint[] = [
		{ x: 0, y: 0 },
		{ x: outWidth - 1, y: 0 },
		{ x: outWidth - 1, y: outHeight - 1 },
		{ x: 0, y: outHeight - 1 },
	];
	const matrix: number[][] = [];
	const rhs: number[] = [];
	for (let i = 0; i < 4; i++) {
		const source = corners[i];
		const dest = destination[i];
		matrix.push([
			dest.x, dest.y, 1, 0, 0, 0, -source.x * dest.x, -source.x * dest.y,
		]);
		rhs.push(source.x);
		matrix.push([
			0, 0, 0, dest.x, dest.y, 1, -source.y * dest.x, -source.y * dest.y,
		]);
		rhs.push(source.y);
	}
	const coefficients = solveLinearSystem(matrix, rhs);
	return [
		coefficients[0], coefficients[1], coefficients[2],
		coefficients[3], coefficients[4], coefficients[5],
		coefficients[6], coefficients[7], 1,
	];
}

function applyHomography(homography: number[], x: number, y: number): PagePoint {
	const denominator = homography[6] * x + homography[7] * y + homography[8];
	if (Math.abs(denominator) < 1e-8) return { x: 0, y: 0 };
	return {
		x: (homography[0] * x + homography[1] * y + homography[2]) / denominator,
		y: (homography[3] * x + homography[4] * y + homography[5]) / denominator,
	};
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
	const size = rhs.length;
	const rows = matrix.map((row, index) => row.concat(rhs[index]));
	for (let column = 0; column < size; column++) {
		let pivot = column;
		for (let row = column + 1; row < size; row++) {
			if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
		}
		const swap = rows[column];
		rows[column] = rows[pivot];
		rows[pivot] = swap;
		const pivotValue = rows[column][column];
		if (Math.abs(pivotValue) < 1e-8) {
			throw new Error('Could not warp the page');
		}
		for (let col = column; col <= size; col++) {
			rows[column][col] /= pivotValue;
		}
		for (let row = 0; row < size; row++) {
			if (row === column) continue;
			const factor = rows[row][column];
			for (let col = column; col <= size; col++) {
				rows[row][col] -= factor * rows[column][col];
			}
		}
	}
	return rows.map((row) => row[size]);
}

function sampleBilinear(
	data: Uint8ClampedArray,
	width: number,
	height: number,
	x: number,
	y: number,
): [number, number, number] {
	const clampedX = Math.min(width - 1, Math.max(0, x));
	const clampedY = Math.min(height - 1, Math.max(0, y));
	const x0 = Math.floor(clampedX);
	const y0 = Math.floor(clampedY);
	const x1 = Math.min(width - 1, x0 + 1);
	const y1 = Math.min(height - 1, y0 + 1);
	const tx = clampedX - x0;
	const ty = clampedY - y0;
	const sample = (sx: number, sy: number): [number, number, number] => {
		const offset = (sy * width + sx) * 4;
		return [data[offset], data[offset + 1], data[offset + 2]];
	};
	const topLeft = sample(x0, y0);
	const topRight = sample(x1, y0);
	const bottomLeft = sample(x0, y1);
	const bottomRight = sample(x1, y1);
	const mix = (channel: number) => {
		const top = topLeft[channel] * (1 - tx) + topRight[channel] * tx;
		const bottom = bottomLeft[channel] * (1 - tx) + bottomRight[channel] * tx;
		return Math.round(top * (1 - ty) + bottom * ty);
	};
	return [mix(0), mix(1), mix(2)];
}
