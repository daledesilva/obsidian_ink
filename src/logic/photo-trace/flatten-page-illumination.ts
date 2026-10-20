//////////
//////////

const BACKGROUND_LONG_EDGE_PX = 320;
const CLOSE_SHORT_EDGE_FRACTION = 1 / 12;
const CLOSE_RADIUS_MIN = 3;
const CLOSE_RADIUS_MAX = 31;
const FIELD_BLUR_RADIUS = 1;
const PAPER_FIELD_PERCENTILE = 0.9;

/**
 * Lifts slow lighting (hand shadows) by dividing RGB by a morphological
 * estimate of the paper field. Closing is larger than the pen so ink stays
 * darker than local paper. Runs on a ~320px buffer so 4k convert stays cheap.
 */
export function flattenPageIlluminationImageData(source: ImageData): ImageData {
	const dest = new ImageData(source.width, source.height);
	flattenPageIlluminationImageDataInto(source, dest);
	return dest;
}

export function flattenPageIlluminationImageDataInto(source: ImageData, dest: ImageData): void {
	if (dest.width !== source.width || dest.height !== source.height) {
		throw new Error('Illumination flatten destination must match the source size');
	}
	const width = source.width;
	const height = source.height;
	const pixelCount = width * height;
	const luminance = new Uint8Array(pixelCount);
	const sourcePixels = source.data;
	for (let index = 0; index < pixelCount; index++) {
		const offset = index * 4;
		luminance[index] = Math.round(
			0.299 * sourcePixels[offset]
			+ 0.587 * sourcePixels[offset + 1]
			+ 0.114 * sourcePixels[offset + 2],
		);
	}
	const field = estimatePaperIlluminationField(luminance, width, height);
	const paperRef = percentileFromField(field, PAPER_FIELD_PERCENTILE);
	const destPixels = dest.data;
	for (let index = 0; index < pixelCount; index++) {
		const offset = index * 4;
		const gain = paperRef / Math.max(1, field[index]);
		destPixels[offset] = clampByte(sourcePixels[offset] * gain);
		destPixels[offset + 1] = clampByte(sourcePixels[offset + 1] * gain);
		destPixels[offset + 2] = clampByte(sourcePixels[offset + 2] * gain);
		destPixels[offset + 3] = 255;
	}
}

/** Flatten lighting on a warped page canvas in place (AI JPEG and saved page photo). */
export function flattenPageIlluminationCanvasInPlace(canvas: HTMLCanvasElement): void {
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Could not flatten page lighting');
	const source = context.getImageData(0, 0, canvas.width, canvas.height);
	flattenPageIlluminationImageDataInto(source, source);
	context.putImageData(source, 0, 0);
}

function estimatePaperIlluminationField(
	luminance: Uint8Array,
	width: number,
	height: number,
): Float32Array {
	const longEdge = Math.max(width, height);
	const scale = Math.min(1, BACKGROUND_LONG_EDGE_PX / Math.max(1, longEdge));
	const smallWidth = Math.max(1, Math.round(width * scale));
	const smallHeight = Math.max(1, Math.round(height * scale));
	const small = downsampleBox(luminance, width, height, smallWidth, smallHeight);
	const radius = closingRadius(smallWidth, smallHeight);
	const closed = erodeGray(
		dilateGray(small, smallWidth, smallHeight, radius),
		smallWidth,
		smallHeight,
		radius,
	);
	const blurred = boxBlurGray(closed, smallWidth, smallHeight, FIELD_BLUR_RADIUS);
	return upsampleBilinear(blurred, smallWidth, smallHeight, width, height);
}

function closingRadius(width: number, height: number): number {
	const raw = Math.round(Math.min(width, height) * CLOSE_SHORT_EDGE_FRACTION);
	const odd = raw % 2 === 0 ? raw + 1 : raw;
	return Math.min(CLOSE_RADIUS_MAX, Math.max(CLOSE_RADIUS_MIN, odd));
}

function downsampleBox(
	luminance: Uint8Array,
	width: number,
	height: number,
	outWidth: number,
	outHeight: number,
): Uint8Array {
	const out = new Uint8Array(outWidth * outHeight);
	for (let y = 0; y < outHeight; y++) {
		const y0 = Math.floor((y * height) / outHeight);
		const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / outHeight));
		for (let x = 0; x < outWidth; x++) {
			const x0 = Math.floor((x * width) / outWidth);
			const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / outWidth));
			let sum = 0;
			let count = 0;
			for (let yy = y0; yy < y1 && yy < height; yy++) {
				const row = yy * width;
				for (let xx = x0; xx < x1 && xx < width; xx++) {
					sum += luminance[row + xx];
					count++;
				}
			}
			out[y * outWidth + x] = Math.round(sum / Math.max(1, count));
		}
	}
	return out;
}

function dilateGray(gray: Uint8Array, width: number, height: number, radius: number): Uint8Array {
	return rankGray(gray, width, height, radius, true);
}

function erodeGray(gray: Uint8Array, width: number, height: number, radius: number): Uint8Array {
	return rankGray(gray, width, height, radius, false);
}

function rankGray(
	gray: Uint8Array,
	width: number,
	height: number,
	radius: number,
	dilate: boolean,
): Uint8Array {
	const out = new Uint8Array(gray.length);
	for (let y = 0; y < height; y++) {
		const y0 = Math.max(0, y - radius);
		const y1 = Math.min(height - 1, y + radius);
		for (let x = 0; x < width; x++) {
			const x0 = Math.max(0, x - radius);
			const x1 = Math.min(width - 1, x + radius);
			let value = dilate ? 0 : 255;
			for (let yy = y0; yy <= y1; yy++) {
				const row = yy * width;
				for (let xx = x0; xx <= x1; xx++) {
					const sample = gray[row + xx];
					if (dilate) {
						if (sample > value) value = sample;
					} else if (sample < value) {
						value = sample;
					}
				}
			}
			out[y * width + x] = value;
		}
	}
	return out;
}

function boxBlurGray(
	gray: Uint8Array,
	width: number,
	height: number,
	radius: number,
): Uint8Array {
	const out = new Uint8Array(gray.length);
	for (let y = 0; y < height; y++) {
		const y0 = Math.max(0, y - radius);
		const y1 = Math.min(height - 1, y + radius);
		for (let x = 0; x < width; x++) {
			const x0 = Math.max(0, x - radius);
			const x1 = Math.min(width - 1, x + radius);
			let sum = 0;
			let count = 0;
			for (let yy = y0; yy <= y1; yy++) {
				const row = yy * width;
				for (let xx = x0; xx <= x1; xx++) {
					sum += gray[row + xx];
					count++;
				}
			}
			out[y * width + x] = Math.round(sum / Math.max(1, count));
		}
	}
	return out;
}

function upsampleBilinear(
	small: Uint8Array,
	smallWidth: number,
	smallHeight: number,
	width: number,
	height: number,
): Float32Array {
	const out = new Float32Array(width * height);
	const xScale = smallWidth / Math.max(1, width);
	const yScale = smallHeight / Math.max(1, height);
	const maxX = smallWidth - 1;
	const maxY = smallHeight - 1;
	for (let y = 0; y < height; y++) {
		const srcY = (y + 0.5) * yScale - 0.5;
		const y0 = Math.min(maxY, Math.max(0, Math.floor(srcY)));
		const y1 = Math.min(maxY, y0 + 1);
		const ty = srcY - y0;
		for (let x = 0; x < width; x++) {
			const srcX = (x + 0.5) * xScale - 0.5;
			const x0 = Math.min(maxX, Math.max(0, Math.floor(srcX)));
			const x1 = Math.min(maxX, x0 + 1);
			const tx = srcX - x0;
			const top = small[y0 * smallWidth + x0] * (1 - tx) + small[y0 * smallWidth + x1] * tx;
			const bottom = small[y1 * smallWidth + x0] * (1 - tx) + small[y1 * smallWidth + x1] * tx;
			out[y * width + x] = top * (1 - ty) + bottom * ty;
		}
	}
	return out;
}

function percentileFromField(field: Float32Array, percentile: number): number {
	const step = Math.max(1, Math.floor(field.length / 4000));
	const samples: number[] = [];
	for (let index = 0; index < field.length; index += step) {
		samples.push(field[index]);
	}
	samples.sort((left, right) => left - right);
	const rank = Math.min(samples.length - 1, Math.max(0, Math.round((samples.length - 1) * percentile)));
	return Math.max(1, samples[rank] ?? 255);
}

function clampByte(value: number): number {
	return Math.min(255, Math.max(0, Math.round(value)));
}
