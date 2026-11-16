import type InkPlugin from 'src/main';
import { findPageQuad, fullFrameCorners } from './find-page-quad';
import { rotatePageCornersQuarterTurns } from './rotate-image-data';
import {
	setPhotoBatchThumbnailPage,
	type PhotoBatch,
	type PhotoBatchItem,
	type PhotoCornerQuad,
} from './photo-batch-session';
import {
	decodePhotoToCanvas,
	imageDataFromCanvas,
	luminanceFromCanvas,
} from './run-photo-trace';
import { PHOTO_TRACE_DEFAULT_EDGE_PX } from './trace-from-raster';

//////////
//////////

export interface PreparePhotoBatchThumbnailsOptions {
	plugin: InkPlugin;
	batch: PhotoBatch;
	/** Called after each photo lands so the grid can show its pins straight away. */
	onThumbnailReady?: () => void;
}

/**
 * Decodes every photo that does not yet know its page shape, so the thumbnail grid
 * can draw the corner pins before the user opens anything.
 *
 * Runs one photo at a time and drops each canvas before the next, because a batch of
 * full-size photos would not fit in memory if they were decoded together. A photo that
 * fails to decode is skipped: the grid still opens, and the failure surfaces again when
 * that photo is converted.
 */
export async function preparePhotoBatchThumbnails(
	options: PreparePhotoBatchThumbnailsOptions,
): Promise<void> {
	for (const item of options.batch.items) {
		if (item.thumbnailCorners) continue;
		try {
			await prepareOneThumbnail(item);
		} catch {
			continue;
		}
		options.onThumbnailReady?.();
	}
}

/** Fills in one item's thumbnail ratio and page corners. */
async function prepareOneThumbnail(item: PhotoBatchItem): Promise<void> {
	const photoCanvas = await decodePhotoToCanvas(item.file, PHOTO_TRACE_DEFAULT_EDGE_PX);
	const photoImage = imageDataFromCanvas(photoCanvas);
	const quarterTurnsClockwise = item.pinnedPage?.quarterTurnsClockwise
		?? item.settings?.quarterTurnsClockwise
		?? 0;
	let corners: PhotoCornerQuad;
	if (item.pinnedPage) {
		// Saved pins are already in the turned photo's space.
		corners = item.pinnedPage.corners;
	} else if (item.settings) {
		corners = item.settings.corners;
	} else {
		// Detection runs on the unturned photo, so anything found here has to be turned to
		// match the photo the card shows. Detection is the same call the page step makes.
		const detectedQuad = item.detectedCorners ?? findPageQuad(
			luminanceFromCanvas(photoCanvas),
			photoCanvas.width,
			photoCanvas.height,
			photoImage.data,
		)?.corners;
		const unturnedCorners = item.detectedCorners
			?? detectedQuad
			?? fullFrameCorners(photoImage.width, photoImage.height);
		if (!item.detectedCorners) item.detectedCorners = unturnedCorners;
		corners = rotatePageCornersQuarterTurns(
			unturnedCorners,
			photoImage.width,
			photoImage.height,
			quarterTurnsClockwise,
		);
	}
	// Corners are stored in the turned photo's space, so the ratio must come from it too.
	const turnedIsSideways = quarterTurnsClockwise % 2 !== 0;
	setPhotoBatchThumbnailPage(
		item,
		turnedIsSideways ? photoImage.height : photoImage.width,
		turnedIsSideways ? photoImage.width : photoImage.height,
		corners,
	);
}
