import InkPlugin from 'src/main';
import { Editor, Notice } from 'obsidian';
import {
	countPendingPhotos,
	createPhotoBatch,
	disposePhotoBatch,
	findNextPendingPhotoIndex,
	markPhotoBatchItemConverted,
	photoBatchPositionLabel,
	photoBatchStepLabel,
	pinPhotoBatchPage,
	setPhotoBatchPreviewUrl,
	setPhotoBatchTarget,
	setPhotoBatchThumbnailPage,
	type PhotoBatch,
	type PhotoBatchItem,
	type PhotoCornerQuad,
	type PhotoStepSettings,
} from 'src/logic/photo-trace/photo-batch-session';
import { renderPhotoBatchThumbnail } from 'src/logic/photo-trace/photo-batch-thumbnail-preview';
import {
	openWritingPhotoBatchModal,
	type WritingPhotoBatchChoice,
} from 'src/components/dom-components/modals/writing-photo-batch-modal/writing-photo-batch-modal';
import {
	openWritingPhotoPageModal,
	type WritingPhotoPageChoice,
} from 'src/components/dom-components/modals/writing-photo-page-modal/writing-photo-page-modal';
import {
	openWritingPhotoConvertedStep,
	type WritingPhotoConvertedStepChoice,
} from 'src/components/dom-components/modals/writing-photo-converted-step-modal/writing-photo-converted-step-modal';
import { PhotoDecodeCache } from 'src/logic/photo-trace/photo-decode-cache';
import { openWritingPhotoProgressModal } from 'src/components/dom-components/modals/writing-photo-progress-modal/writing-photo-progress-modal';
import {
	assessPagePhoto,
	autoTuneAdjustmentAndSensitivity,
} from 'src/logic/photo-trace/adjust-page-photo';
import {
	flattenPageIlluminationCanvasInPlace,
	flattenPageIlluminationImageData,
} from 'src/logic/photo-trace/flatten-page-illumination';
import { findPageQuad, fullFrameCorners } from 'src/logic/photo-trace/find-page-quad';
import type {
	InkPhotoConvertTarget,
	PhotoStepNav,
} from 'src/logic/photo-trace/photo-convert-target';
import {
	PhotoTraceCancelledError,
	PhotoTraceWorkerClient,
} from 'src/logic/photo-trace/photo-trace-worker-client';
import { rotateImageDataQuarterTurns } from 'src/logic/photo-trace/rotate-image-data';
import {
	canvasFromRgba,
	decodePhotoToCanvas,
	imageDataFromCanvas,
	luminanceFromCanvas,
	scaleImageDataToMaxEdge,
} from 'src/logic/photo-trace/run-photo-trace';
import {
	PHOTO_TRACE_DEFAULT_DETAIL,
	PHOTO_TRACE_DEFAULT_EDGE_PX,
	PHOTO_TRACE_PREVIEW_MAX_EDGE_PX,
	photoTraceMinPolylineLength,
	photoTraceSauvolaK,
	photoTraceSimplifyEpsilon,
	type PhotoTraceResult,
} from 'src/logic/photo-trace/trace-from-raster';
import { createInkFileFromPhotoTrace } from 'src/logic/photo-trace/write-ink-file-from-photo';

////////
////////

/** Mutable state shared by every step of one batch run. */
interface PhotoBatchRunState {
	/** Only the first created file may claim the activate-next-embed flag. */
	hasActivatedFirstEmbed: boolean;
	createdCount: number;
}

/** Where a step wants the queue to go next. */
type PhotoQueueNavigation = PhotoStepNav;

////////
////////

/**
 * Command entry: collect one or more photos, then trace them in the chosen order.
 */
export const insertWritingFromPhoto = (plugin: InkPlugin, editor: Editor): void => {
	const batch = createPhotoBatch();
	void runPhotoBatchWizard(plugin, editor, batch);
};

/**
 * Grid, then ordered photo steps, for as long as the user keeps asking for it.
 * Returning to the grid is deliberate: photos can be added or reordered between
 * passes, and Convert all is available from the grid at any time.
 */
async function runPhotoBatchWizard(
	plugin: InkPlugin,
	editor: Editor,
	batch: PhotoBatch,
): Promise<void> {
	const state: PhotoBatchRunState = { hasActivatedFirstEmbed: false, createdCount: 0 };
	const worker = new PhotoTraceWorkerClient(plugin);
	// Neighbour photos are decoded while a dialog is open, so Next and Prev can swap
	// dialogs in the same turn instead of closing first and leaving a blank gap.
	const decodeCache = new PhotoDecodeCache(async (item) => {
		const decoded = await decodePhotoForTracing(item);
		return decoded.photoImage;
	});
	try {
		let isRunning = true;
		while (isRunning) {
			// A cancelled conversion kills the worker for good. Every pass through the
			// grid starts with no request in flight, so it is the safe place to revive it.
			worker.reset();
			const gridChoice = await openGridModal(plugin, batch, decodeCache);
			if (gridChoice.action === 'cancel') return;
			if (gridChoice.action === 'convert-all') {
				await convertAllPendingPhotos(plugin, editor, batch, state, worker);
				// Cancelling the progress dialog leaves the remaining photos queued, so the
				// grid comes back instead of silently dropping them.
				if (countPendingPhotos(batch) === 0) isRunning = false;
				continue;
			}
			// Read from this grid pass only. Carrying it across passes made every later run
			// look like a pencil edit, so the batch footer never reappeared.
			const editFromItemId = gridChoice.action === 'edit' ? gridChoice.itemId : null;
			const outcome = await runPhotoQueue(plugin, batch, worker, decodeCache, editFromItemId);
			if (outcome === 'finished') isRunning = false;
			if (outcome === 'convert-all') {
				// Convert all from a step screen finishes everything still pending and then
				// closes the batch; the grid only returns when a conversion is cancelled.
				await convertAllPendingPhotos(plugin, editor, batch, state, worker);
				if (countPendingPhotos(batch) === 0) isRunning = false;
			}
		}
	} finally {
		disposePhotoBatch(batch);
		worker.cancel();
		if (state.createdCount > 0) new Notice(buildBatchSummary(state.createdCount));
	}
}

/** Opens the thumbnail grid and resolves once the user leaves it. */
function openGridModal(
	plugin: InkPlugin,
	batch: PhotoBatch,
	decodeCache: PhotoDecodeCache,
): Promise<WritingPhotoBatchChoice> {
	return new Promise((resolve) => {
		openWritingPhotoBatchModal({
			plugin,
			batch,
			warmUpcomingPhoto: () => warmRefineTarget(batch, decodeCache),
			beforeLeave: (choice) => prepareGridHandoff(batch, choice, decodeCache),
			onChoice: (choice) => resolve(choice),
		});
	});
}

/**
 * Decodes the photo Refine images would open, while the grid is still up.
 * That click then closes the grid and opens the adjust dialog in one turn.
 */
function warmRefineTarget(batch: PhotoBatch, decodeCache: PhotoDecodeCache): void {
	const index = findNextPendingPhotoIndex(batch, 0);
	if (index < 0) return;
	decodeCache.warmItem(batch.items[index]);
}

/**
 * Makes the photo the grid is about to open ready before the grid closes.
 * Convert all opens the progress dialog immediately, so it does not wait on a decode.
 */
function prepareGridHandoff(
	batch: PhotoBatch,
	choice: WritingPhotoBatchChoice,
	decodeCache: PhotoDecodeCache,
): void | Promise<void> {
	if (choice.action === 'cancel' || choice.action === 'convert-all') return;
	let index = 0;
	if (choice.action === 'edit') {
		const requestedIndex = batch.items.findIndex((item) => item.id === choice.itemId);
		if (requestedIndex >= 0) index = requestedIndex;
	} else {
		const pendingIndex = findNextPendingPhotoIndex(batch, 0);
		if (pendingIndex >= 0) index = pendingIndex;
	}
	return decodeCache.prepare(batch.items[index]);
}

/**
 * Walks the photos in grid order. Thumbnails returns to the grid. Prev is disabled
 * on the first photo, and stepping past the last photo finishes the batch.
 *
 * `startItemId` is set by a thumbnail's pencil. That opens the same adjust page as
 * Refine images, already on that photo, with Thumbnails, Prev, Next, and Convert all.
 */
async function runPhotoQueue(
	plugin: InkPlugin,
	batch: PhotoBatch,
	worker: PhotoTraceWorkerClient,
	decodeCache: PhotoDecodeCache,
	startItemId: string | null,
): Promise<'back-to-grid' | 'convert-all' | 'finished'> {
	let index = 0;
	if (startItemId) {
		const requestedIndex = batch.items.findIndex((item) => item.id === startItemId);
		if (requestedIndex >= 0) index = requestedIndex;
	} else {
		const firstPendingIndex = findNextPendingPhotoIndex(batch, 0);
		if (firstPendingIndex >= 0) index = firstPendingIndex;
	}
	const itemCount = batch.items.length;

	while (index >= 0 && index < itemCount) {
		const item = batch.items[index];
		const positionLabel = photoBatchPositionLabel(batch, item.id);
		const canGoPrevious = index > 0;
		const canGoNext = index < itemCount - 1;
		let navigation: PhotoQueueNavigation;

		if (item.convertedTarget) {
			// Neighbours start once this step is opening, not while an earlier photo is
			// still decoding. A click can then close and open in one turn.
			decodeCache.prefetchAround(batch, index);
			navigation = await openConvertedStep(
				plugin,
				batch,
				index,
				item,
				positionLabel,
				canGoPrevious,
				canGoNext,
				decodeCache,
			);
		} else {
			const itemOutcome = await runPhotoItemSteps(
				plugin,
				batch,
				index,
				item,
				positionLabel,
				canGoPrevious,
				canGoNext,
				decodeCache,
			);
			navigation = itemOutcome.navigation;
		}

		if (navigation === 'cancel') return 'finished';
		if (navigation === 'photos') return 'back-to-grid';
		if (navigation === 'convert-all') return 'convert-all';
		if (navigation === 'previous') {
			// Stepping back into a cancelled worker would fail on the next request, so
			// revive it here where nothing is in flight.
			worker.reset();
			index -= 1;
			if (index < 0) return 'back-to-grid';
			continue;
		}
		worker.reset();
		index += 1;
	}
	return 'finished';
}

/** Resolves the read-only step for a photo that is already in the note. */
function openConvertedStep(
	plugin: InkPlugin,
	batch: PhotoBatch,
	index: number,
	item: PhotoBatchItem,
	positionLabel: string,
	canGoPrevious: boolean,
	canGoNext: boolean,
	decodeCache: PhotoDecodeCache,
): Promise<PhotoQueueNavigation> {
	return new Promise((resolve) => {
		openWritingPhotoConvertedStep({
			plugin,
			target: item.convertedTarget ?? item.target,
			positionLabel,
			canGoPrevious,
			canGoNext,
			beforeLeave: (choice) => prepareStepHandoff(batch, index, choice, decodeCache),
			onChoice: (choice) => {
				if (choice.action === 'next') {
					resolve('next');
					return;
				}
				resolve(choice.action);
			},
		});
	});
}

/**
 * Decodes the photo a Prev or Next click is about to open.
 *
 * Thumbnails and Convert all do not need that bitmap before their own dialog opens,
 * so they return immediately and the current dialog can close in the click.
 */
function prepareStepHandoff(
	batch: PhotoBatch,
	index: number,
	choice: WritingPhotoConvertedStepChoice,
	decodeCache: PhotoDecodeCache,
): void | Promise<void> {
	if (choice.action !== 'next' && choice.action !== 'previous') return;
	const destinationIndex = choice.action === 'next' ? index + 1 : index - 1;
	return decodeCache.prepare(batch.items[destinationIndex]);
}

interface PhotoItemOutcome {
	navigation: PhotoQueueNavigation;
}

/**
 * Everything about one photo's page, in a single step: turn it, move the pins, and tune
 * the detection. Corners and detection used to be two dialogs, which is why the
 * thumbnail's pencil behaved differently from Refine images: one skipped the pins entirely.
 *
 * Nothing is warped or cropped here. The corner quad is drawn over the whole photo, and
 * the warp happens at convert time.
 */
async function runPhotoItemSteps(
	plugin: InkPlugin,
	batch: PhotoBatch,
	index: number,
	item: PhotoBatchItem,
	positionLabel: string,
	canGoPrevious: boolean,
	canGoNext: boolean,
	decodeCache: PhotoDecodeCache,
): Promise<PhotoItemOutcome> {
	const cachedError = decodeCache.errorFor(item.id);
	if (cachedError) {
		new Notice(`Could not read a photo: ${cachedError}`);
		return { navigation: 'next' };
	}
	let photoImage = decodeCache.peek(item.id);
	if (!photoImage) photoImage = await decodeCache.load(item);
	if (!photoImage) {
		new Notice(`Could not read a photo: ${decodeCache.errorFor(item.id) ?? 'unknown error'}`);
		return { navigation: 'next' };
	}
	const sourceImage = photoImage;

	// Neighbours start only after this bitmap is ready, in the same turn the dialog
	// opens. Starting them earlier would decode this photo and the next one together,
	// which is the wait the handoff is trying to hide.
	decodeCache.prefetchAround(batch, index);

	const pageChoice = await openWritingPhotoPageModal({
		plugin,
		sourceImage,
		defaultCorners: findStartingCorners(item, sourceImage),
		quarterTurnsClockwise: findStartingQuarterTurns(item),
		initialSettings: item.settings,
		currentTarget: item.target,
		onTargetChange: (target) => setPhotoBatchTarget(batch, item.id, target),
		positionLabel,
		canGoPrevious,
		canGoNext,
		beforeLeave: (choice) => {
			if (choice.action === 'cancel') {
				// Closing drops this page. There is no next dialog that needs a bitmap.
				return;
			}
			return rememberPageChoice(batch, index, item, sourceImage, choice, decodeCache);
		},
	});

	if (pageChoice.action === 'cancel') return { navigation: 'cancel' };
	return { navigation: pageChoice.action };
}

/**
 * Stores the page the user just left, then makes the next dialog ready to open.
 *
 * The grid preview is rebuilt in the background for Prev and Next. Waiting on it
 * used to close this dialog and leave the note showing until the jpeg finished.
 * Thumbnails is the one exit that shows that preview immediately, so it does wait.
 */
function rememberPageChoice(
	batch: PhotoBatch,
	index: number,
	item: PhotoBatchItem,
	photoImage: ImageData,
	choice: Exclude<WritingPhotoPageChoice, { action: 'cancel' }>,
	decodeCache: PhotoDecodeCache,
): void | Promise<void> {
	const settings: PhotoStepSettings = {
		corners: choice.corners,
		quarterTurnsClockwise: choice.quarterTurnsClockwise,
		adjustment: choice.adjustment,
		inkSensitivity: choice.inkSensitivity,
		noiseCleanup: choice.noiseCleanup,
	};
	item.settings = settings;
	pinPhotoBatchPage(item, settings.corners, settings.quarterTurnsClockwise);
	// The thumbnail shows the same page shape, so it agrees with what was just pinned.
	// Corners are in the turned photo's space, so the stored ratio must match that too.
	const turnedIsSideways = settings.quarterTurnsClockwise % 2 !== 0;
	setPhotoBatchThumbnailPage(
		item,
		turnedIsSideways ? photoImage.height : photoImage.width,
		turnedIsSideways ? photoImage.width : photoImage.height,
		settings.corners,
	);
	const thumbnailReady = refreshPhotoBatchThumbnail(batch, item, settings);
	if (choice.action === 'photos') {
		// The grid is about to show this preview, so the dialog waits until the jpeg exists.
		return thumbnailReady;
	}
	void thumbnailReady;
	return prepareStepHandoff(batch, index, choice, decodeCache);
}

/**
 * Rebuilds a photo's grid preview from its current settings.
 *
 * A rotation or a detection change is applied here, otherwise the card would keep showing
 * the raw file the user opened it from. A preview failure is not fatal: the grid falls back
 * to the raw thumbnail and the conversion still works.
 */
async function refreshPhotoBatchThumbnail(
	batch: PhotoBatch,
	item: PhotoBatchItem,
	settings: PhotoStepSettings,
): Promise<void> {
	try {
		const previewUrl = await renderPhotoBatchThumbnail(item, settings);
		setPhotoBatchPreviewUrl(batch, item.id, previewUrl);
	} catch {
		// Leave the existing preview in place.
	}
}

/**
 * Converts every photo that is still waiting, with detected corners and auto-tuned
 * detection. Photos the user already set up keep their saved corners and settings.
 */
async function convertAllPendingPhotos(
	plugin: InkPlugin,
	editor: Editor,
	batch: PhotoBatch,
	state: PhotoBatchRunState,
	worker: PhotoTraceWorkerClient,
): Promise<void> {
	if (countPendingPhotos(batch) === 0) return;
	let isCancelled = false;
	const progress = openWritingPhotoProgressModal({
		plugin,
		title: 'Converting photos',
		initialStage: 'Preparing the photos…',
		onCancel: () => {
			isCancelled = true;
			worker.cancel();
		},
	});

	try {
		for (const item of batch.items) {
			if (isCancelled) break;
			if (item.convertedTarget) continue;
			const stepLabel = photoBatchStepLabel(batch, item.id);
			try {
				await convertOnePhotoWithoutSteps(plugin, editor, item, stepLabel, state, worker, progress.setStage);
			} catch (error) {
				if (error instanceof PhotoTraceCancelledError || isCancelled) break;
				// One bad photo must not throw away the rest of the batch.
				progress.setStage(`${stepLabel} — could not convert this photo.`);
			}
		}
	} finally {
		progress.close();
	}
}

/**
 * Decode, detect, warp, auto-tune, trace, and write one photo with no dialogs other
 * than the shared progress log.
 */
async function convertOnePhotoWithoutSteps(
	plugin: InkPlugin,
	editor: Editor,
	item: PhotoBatchItem,
	stepLabel: string,
	state: PhotoBatchRunState,
	worker: PhotoTraceWorkerClient,
	setStage: (stage: string, percent?: number) => void,
): Promise<void> {
	setStage(`${stepLabel} — reading the photo…`);
	const photoImage = (await decodePhotoForTracing(item)).photoImage;
	// A photo already set up in the corners step keeps those pins; the rest use the
	// detected page, which is the same default the corners step would have shown.
	const quarterTurnsClockwise = findStartingQuarterTurns(item);
	const corners = findStartingCorners(item, photoImage);

	const orientedPhoto = rotateImageDataQuarterTurns(photoImage, quarterTurnsClockwise);
	const warped = await worker.warp({
		rgba: orientedPhoto.data,
		width: orientedPhoto.width,
		height: orientedPhoto.height,
		corners,
		maxEdgePx: PHOTO_TRACE_DEFAULT_EDGE_PX,
		onProgress: (stage, percent) => setStage(`${stepLabel} — ${stage}`, percent),
	});
	const pageCanvas = canvasFromRgba(warped.rgba, warped.width, warped.height);

	let settings = item.settings;
	if (!settings) {
		setStage(`${stepLabel} — measuring the page…`);
		const previewImage = scaleImageDataToMaxEdge(
			imageDataFromCanvas(pageCanvas),
			PHOTO_TRACE_PREVIEW_MAX_EDGE_PX,
		);
		const flattenedPreview = flattenPageIlluminationImageData(previewImage);
		const assessment = assessPagePhoto(flattenedPreview);
		const tuned = autoTuneAdjustmentAndSensitivity(
			flattenedPreview,
			assessment,
			assessment.lightInk,
		);
		settings = {
			corners,
			quarterTurnsClockwise,
			adjustment: tuned.adjustment,
			inkSensitivity: tuned.inkSensitivity,
			noiseCleanup: true,
		};
		item.settings = settings;
	}

	// The trace always reads a flattened page. Convert reuses this raster, so the
	// mask is measured on the same pixels the preview used.
	flattenPageIlluminationCanvasInPlace(pageCanvas);
	setStage(`${stepLabel} — tracing locally…`);
	const traceResult = await worker.convert({
		rgba: imageDataFromCanvas(pageCanvas).data,
		width: pageCanvas.width,
		height: pageCanvas.height,
		corners: settings.corners,
		maxEdgePx: PHOTO_TRACE_DEFAULT_EDGE_PX,
		adjustment: settings.adjustment,
		dropLargeBorderComponents: true,
		simplifyEpsilon: photoTraceSimplifyEpsilon(PHOTO_TRACE_DEFAULT_DETAIL),
		minPolylineLengthPx: photoTraceMinPolylineLength(PHOTO_TRACE_DEFAULT_DETAIL),
		sauvolaK: photoTraceSauvolaK(settings.inkSensitivity),
		noiseCleanup: settings.noiseCleanup,
		alreadyWarped: true,
		onProgress: (stage, percent) => setStage(`${stepLabel} — ${stage}`, percent),
	});
	setStage(`${stepLabel} — saving the ink file…`);
	await writeTracedPhoto(plugin, editor, item, settings, traceResult, state);
}

/**
 * Where the corners step should start for this photo: the pins the user confirmed,
 * then the cached detection, then the whole frame.
 */
function findStartingCorners(item: PhotoBatchItem, photoImage: ImageData): PhotoCornerQuad {
	if (item.pinnedPage) return item.pinnedPage.corners;
	if (item.settings) return item.settings.corners;
	return item.detectedCorners ?? fullFrameCorners(photoImage.width, photoImage.height);
}

/** The quarter turns already chosen for this photo, or the unrotated photo. */
function findStartingQuarterTurns(item: PhotoBatchItem): number {
	if (item.pinnedPage) return item.pinnedPage.quarterTurnsClockwise;
	if (item.settings) return item.settings.quarterTurnsClockwise;
	return 0;
}

/**
 * Decodes the photo, caches the detected page corners, and records the thumbnail's
 * shape and pin positions so the grid can show them without decoding again.
 */
async function decodePhotoForTracing(
	item: PhotoBatchItem,
): Promise<{ photoImage: ImageData }> {
	const photoCanvas = await decodePhotoToCanvas(item.file, PHOTO_TRACE_DEFAULT_EDGE_PX);
	const photoImage = imageDataFromCanvas(photoCanvas);
	if (!item.detectedCorners) {
		const photoGray = luminanceFromCanvas(photoCanvas);
		const detectedQuad = findPageQuad(photoGray, photoCanvas.width, photoCanvas.height, photoImage.data);
		item.detectedCorners = detectedQuad?.corners
			?? fullFrameCorners(photoCanvas.width, photoCanvas.height);
	}
	// The thumbnail shows the page shape the corners step would open with.
	if (!item.thumbnailCorners) {
		const startingTurns = findStartingQuarterTurns(item);
		const startingIsSideways = startingTurns % 2 !== 0;
		setPhotoBatchThumbnailPage(
			item,
			startingIsSideways ? photoImage.height : photoImage.width,
			startingIsSideways ? photoImage.width : photoImage.height,
			findStartingCorners(item, photoImage),
		);
	}
	return { photoImage };
}

/** Writes the ink file and embed, then records the photo as converted. */
async function writeTracedPhoto(
	plugin: InkPlugin,
	editor: Editor,
	item: PhotoBatchItem,
	settings: PhotoStepSettings,
	traceResult: PhotoTraceResult,
	state: PhotoBatchRunState,
): Promise<void> {
	const activeFile = plugin.app.workspace.getActiveFile();
	const target: InkPhotoConvertTarget = item.target;
	await createInkFileFromPhotoTrace({
		plugin,
		editor,
		photoFile: item.file,
		quarterTurnsClockwise: settings.quarterTurnsClockwise,
		traceResult,
		target,
		activeFile,
		activateImmediately: !state.hasActivatedFirstEmbed,
	});
	state.hasActivatedFirstEmbed = true;
	state.createdCount += 1;
	markPhotoBatchItemConverted(item, target);
}

/** One closing line for the whole batch, replacing the per-file notices. */
function buildBatchSummary(createdCount: number): string {
	const fileLabel = createdCount === 1 ? 'ink file' : 'ink files';
	return `${createdCount} ${fileLabel} created from photos.`;
}
