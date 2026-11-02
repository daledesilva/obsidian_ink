import {
	assessPagePhoto,
	pagePhotoToneForAdjustment,
	renderAdjustedPagePhoto,
} from './adjust-page-photo';
import { flattenPageIlluminationImageData } from './flatten-page-illumination';
import type { PhotoBatchItem, PhotoStepSettings } from './photo-batch-session';
import { rotateImageDataQuarterTurns } from './rotate-image-data';
import { canvasFromRgba, decodePhotoToCanvas, imageDataFromCanvas } from './run-photo-trace';
import { PHOTO_TRACE_PREVIEW_MAX_EDGE_PX } from './trace-from-raster';

//////////
//////////

/**
 * Builds the small picture a grid card shows for one photo, after it has been edited.
 *
 * The card used to keep the raw file URL it was created with, so rotating or adjusting a
 * photo left the thumbnail showing the original. This renders the turned photo with the
 * detection settings applied, at preview size, so the grid agrees with the edit screen.
 *
 * Returns an object URL the caller owns; pass it to setPhotoBatchPreviewUrl, which frees
 * the one it replaces.
 */
export async function renderPhotoBatchThumbnail(
	item: PhotoBatchItem,
	settings: PhotoStepSettings,
): Promise<string> {
	const photoCanvas = await decodePhotoToCanvas(item.file, PHOTO_TRACE_PREVIEW_MAX_EDGE_PX);
	const photoImage = imageDataFromCanvas(photoCanvas);
	const turned = rotateImageDataQuarterTurns(photoImage, settings.quarterTurnsClockwise);
	const flattened = flattenPageIlluminationImageData(turned);
	const assessment = assessPagePhoto(flattened);
	const adjusted = new ImageData(flattened.width, flattened.height);
	renderAdjustedPagePhoto(
		flattened,
		pagePhotoToneForAdjustment(assessment, settings.adjustment.lightInk),
		settings.adjustment,
		adjusted,
	);
	const canvas = canvasFromRgba(adjusted.data, adjusted.width, adjusted.height);
	return canvasJpegObjectUrl(canvas);
}

/** JPEG object URL for a canvas, matching the thumbnail quality used elsewhere. */
function canvasJpegObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error('Could not build the thumbnail preview'));
				return;
			}
			resolve(URL.createObjectURL(blob));
		}, 'image/jpeg', 0.85);
	});
}
