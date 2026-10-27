//////////
//////////

export interface PagePhotoAdjustment {
	/** 0 leaves the paper's colour. 100 pulls it fully toward neutral grey. */
	colourStrength: number;
	/** 0 leaves brightness. 100 stretches ink and paper to the full range. */
	contrastStrength: number;
	/** Invert first so a light pen on a dark page becomes dark ink. */
	lightInk: boolean;
}

export interface PagePhotoTone {
	paperRed: number;
	paperGreen: number;
	paperBlue: number;
	blackPoint: number;
	whitePoint: number;
	colourStrength: number;
	contrastStrength: number;
}

export interface PagePhotoAssessment {
	/** True when the page itself is dark, such as chalk on a board. */
	lightInk: boolean;
	straightTone: PagePhotoTone;
	invertedTone: PagePhotoTone;
}

const LIGHT_INK_MEAN_LUMINANCE = 100;
const PAPER_LUMINANCE_PERCENTILE = 0.6;
const INK_LUMINANCE_PERCENTILE = 0.05;
const PAGE_LUMINANCE_PERCENTILE = 0.95;

/**
 * Measures the paper colour and the ink-to-paper spread.
 * Lighter pixels are treated as paper, because the pen is the dark tail.
 * A dark average means the page itself is dark, so the light-ink path is suggested.
 */
export function assessPagePhoto(image: ImageData): PagePhotoAssessment {
	const straightTone = measurePageTone(image.data, false);
	const invertedTone = measurePageTone(image.data, true);
	const meanLuminance = meanFromHistogram(straightTone.luminanceHistogram, image.data.length / 4);
	return {
		lightInk: meanLuminance < LIGHT_INK_MEAN_LUMINANCE,
		straightTone: straightTone.tone,
		invertedTone: invertedTone.tone,
	};
}

export function pagePhotoToneForAdjustment(
	assessment: PagePhotoAssessment,
	lightInk: boolean,
): PagePhotoTone {
	return lightInk ? assessment.invertedTone : assessment.straightTone;
}

/**
 * Writes the adjusted page into dest. Invert happens first, then the paper
 * colour is pulled toward grey, then luminance is stretched. Dest must match
 * the source size. The source pixels are left unchanged.
 */
export function renderAdjustedPagePhoto(
	source: ImageData,
	tone: PagePhotoTone,
	adjustment: PagePhotoAdjustment,
	dest: ImageData,
): void {
	const colourMix = clampUnit(adjustment.colourStrength) / 100;
	const contrastMix = clampUnit(adjustment.contrastStrength) / 100;
	const paperGrey = (tone.paperRed + tone.paperGreen + tone.paperBlue) / 3;
	const scaleRed = mixScale(tone.paperRed, paperGrey, colourMix);
	const scaleGreen = mixScale(tone.paperGreen, paperGrey, colourMix);
	const scaleBlue = mixScale(tone.paperBlue, paperGrey, colourMix);
	const span = Math.max(1, tone.whitePoint - tone.blackPoint);
	const sourcePixels = source.data;
	const destPixels = dest.data;
	const pixelCount = sourcePixels.length / 4;

	for (let index = 0; index < pixelCount; index++) {
		const offset = index * 4;
		let red = sourcePixels[offset];
		let green = sourcePixels[offset + 1];
		let blue = sourcePixels[offset + 2];
		if (adjustment.lightInk) {
			red = 255 - red;
			green = 255 - green;
			blue = 255 - blue;
		}
		red = clampByte(red * scaleRed);
		green = clampByte(green * scaleGreen);
		blue = clampByte(blue * scaleBlue);

		const luminance = pixelLuminance(red, green, blue);
		const stretched = clampByte(((luminance - tone.blackPoint) / span) * 255);
		const nextLuminance = luminance + (stretched - luminance) * contrastMix;
		const gain = luminance > 0.5 ? nextLuminance / luminance : 0;
		destPixels[offset] = clampByte(red * gain);
		destPixels[offset + 1] = clampByte(green * gain);
		destPixels[offset + 2] = clampByte(blue * gain);
		destPixels[offset + 3] = 255;
	}
}

export function adjustedPageCanvas(
	source: HTMLCanvasElement,
	assessment: PagePhotoAssessment,
	adjustment: PagePhotoAdjustment,
): HTMLCanvasElement {
	const sourceContext = source.getContext('2d');
	if (!sourceContext) throw new Error('Could not read the page photo');
	const sourceImage = sourceContext.getImageData(0, 0, source.width, source.height);
	const destCanvas = document.createElement('canvas');
	destCanvas.width = source.width;
	destCanvas.height = source.height;
	const destContext = destCanvas.getContext('2d');
	if (!destContext) throw new Error('Could not adjust the page photo');
	const destImage = destContext.createImageData(source.width, source.height);
	renderAdjustedPagePhoto(
		sourceImage,
		pagePhotoToneForAdjustment(assessment, adjustment.lightInk),
		adjustment,
		destImage,
	);
	destContext.putImageData(destImage, 0, 0);
	return destCanvas;
}

function measurePageTone(
	pixels: Uint8ClampedArray,
	invert: boolean,
): { tone: PagePhotoTone; luminanceHistogram: Uint32Array } {
	const pixelCount = pixels.length / 4;
	const luminanceHistogram = new Uint32Array(256);
	for (let index = 0; index < pixelCount; index++) {
		const offset = index * 4;
		const channels = readChannels(pixels, offset, invert);
		luminanceHistogram[Math.round(pixelLuminance(channels[0], channels[1], channels[2]))]++;
	}
	const blackPoint = percentileFromHistogram(luminanceHistogram, pixelCount, INK_LUMINANCE_PERCENTILE);
	const whitePoint = Math.max(
		blackPoint + 1,
		percentileFromHistogram(luminanceHistogram, pixelCount, PAGE_LUMINANCE_PERCENTILE),
	);
	const paperStart = percentileFromHistogram(luminanceHistogram, pixelCount, PAPER_LUMINANCE_PERCENTILE);
	const redHistogram = new Uint32Array(256);
	const greenHistogram = new Uint32Array(256);
	const blueHistogram = new Uint32Array(256);
	let paperCount = 0;
	for (let index = 0; index < pixelCount; index++) {
		const offset = index * 4;
		const channels = readChannels(pixels, offset, invert);
		if (pixelLuminance(channels[0], channels[1], channels[2]) < paperStart) continue;
		redHistogram[channels[0]]++;
		greenHistogram[channels[1]]++;
		blueHistogram[channels[2]]++;
		paperCount++;
	}
	const paperRed = percentileFromHistogram(redHistogram, paperCount, 0.5);
	const paperGreen = percentileFromHistogram(greenHistogram, paperCount, 0.5);
	const paperBlue = percentileFromHistogram(blueHistogram, paperCount, 0.5);
	return {
		luminanceHistogram,
		tone: {
			paperRed,
			paperGreen,
			paperBlue,
			blackPoint,
			whitePoint,
			colourStrength: colourStrengthFromPaper(paperRed, paperGreen, paperBlue),
			contrastStrength: contrastStrengthFromSpread(blackPoint, whitePoint),
		},
	};
}

function colourStrengthFromPaper(red: number, green: number, blue: number): number {
	const maxChannel = Math.max(red, green, blue, 1);
	const deviation = Math.max(Math.abs(red - green), Math.abs(green - blue), Math.abs(red - blue)) / maxChannel;
	// Illumination flattening already lifts neutral pages. Only apply channel scaling
	// when the paper has a real colour cast (> 10% channel spread).
	if (deviation <= 0.1) return 0;
	return clampUnit(Math.round((deviation - 0.1) * 180));
}

function contrastStrengthFromSpread(blackPoint: number, whitePoint: number): number {
	const spread = Math.max(0, whitePoint - blackPoint);
	// After illumination flattening, pages with healthy spread (>= 135) need 0 contrast
	// stretch; stretching clips the 5th-percentile ink tail and turns paper grain into specks.
	if (spread >= 135) return 0;
	return clampUnit(Math.round(((135 - spread) / 135) * 65));
}

function mixScale(channel: number, paperGrey: number, colourMix: number): number {
	const fullScale = channel > 1 ? paperGrey / channel : 1;
	return 1 + (fullScale - 1) * colourMix;
}

function readChannels(
	pixels: Uint8ClampedArray,
	offset: number,
	invert: boolean,
): [number, number, number] {
	const red = pixels[offset];
	const green = pixels[offset + 1];
	const blue = pixels[offset + 2];
	if (!invert) return [red, green, blue];
	return [255 - red, 255 - green, 255 - blue];
}

function pixelLuminance(red: number, green: number, blue: number): number {
	return 0.299 * red + 0.587 * green + 0.114 * blue;
}

function percentileFromHistogram(histogram: Uint32Array, count: number, fraction: number): number {
	if (count <= 0) return 0;
	const target = Math.min(count, Math.max(1, Math.ceil(count * fraction)));
	let seen = 0;
	for (let value = 0; value < histogram.length; value++) {
		seen += histogram[value];
		if (seen >= target) return value;
	}
	return histogram.length - 1;
}

function meanFromHistogram(histogram: Uint32Array, count: number): number {
	if (count <= 0) return 0;
	let sum = 0;
	for (let value = 0; value < histogram.length; value++) {
		sum += value * histogram[value];
	}
	return sum / count;
}

function clampUnit(value: number): number {
	return Math.min(100, Math.max(0, value));
}

function clampByte(value: number): number {
	return Math.min(255, Math.max(0, Math.round(value)));
}
