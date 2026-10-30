import InkPlugin from 'src/main';
import { Editor, Notice } from 'obsidian';
import { activateNextEmbed, recordRecentFileSelection } from 'src/logic/utils/storage';
import { buildDrawingEmbed, buildWritingEmbed } from 'src/components/formats/current/utils/build-embeds';
import { buildDrawingEmbedSettingsFromStrokes } from 'src/logic/utils/build-drawing-embed-settings-from-file';
import { readWritingFileAspectRatio } from 'src/logic/utils/writing-embed-aspect-ratio';
import { WritingPhotoPickerModal } from 'src/components/dom-components/modals/writing-photo-picker-modal/writing-photo-picker-modal';
import { openWritingPhotoCropModal } from 'src/components/dom-components/modals/writing-photo-crop-modal/writing-photo-crop-modal';
import {
	openWritingPhotoAdjustModal,
	type WritingPhotoConvertTarget,
} from 'src/components/dom-components/modals/writing-photo-adjust-modal/writing-photo-adjust-modal';
import { openWritingPhotoProgressModal } from 'src/components/dom-components/modals/writing-photo-progress-modal/writing-photo-progress-modal';
import { encodeWritingPhotoJpeg } from 'src/logic/photo-trace/encode-writing-photo-jpeg';
import {
	getNewTimestampedDrawingSvgFilepath,
	getNewTimestampedWritingSvgFilepath,
} from 'src/logic/utils/file-manipulation';
import { createFoldersForFilepath } from 'src/logic/utils/createFoldersForFilepath';
import { parseFilepath } from 'src/logic/utils/parseFilepath';
import {
	buildWritingPhotoJpegVaultPath,
	buildWritingPhotoSourceImageRelativePath,
} from 'src/logic/photo-trace/writing-photo-paths';
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
} from 'src/logic/photo-trace/trace-from-raster';
import {
	findPageQuad,
	fullFrameCorners,
} from 'src/logic/photo-trace/find-page-quad';
import { flattenPageIlluminationCanvasInPlace } from 'src/logic/photo-trace/flatten-page-illumination';
import {
	buildInkCanvasDrawingFileData,
	buildInkCanvasWritingFileData,
} from 'src/components/formats/current/utils/build-file-data';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { renderStrokesToSvg, renderWritingStrokesToSvg } from 'src/ink-canvas/svg-export';
import type { InkCanvasSnapshot } from 'src/ink-canvas/types';
import { WRITING_PAGE_WIDTH } from 'src/constants';
import { DEFAULT_SETTINGS } from 'src/types/plugin-settings';
import {
	enqueueTranscriptionAfterPhotoImport,
	suppressAutoTranscribeOnNextVaultModify,
} from 'src/logic/handwriting-transcription-queue';
import { setInkEmbedDisplayMode } from 'src/logic/ink-embed-display-mode';
import {
	PhotoTraceCancelledError,
	PhotoTraceWorkerClient,
} from 'src/logic/photo-trace/photo-trace-worker-client';
import type { PagePhotoAdjustment } from 'src/logic/photo-trace/adjust-page-photo';
import { rotateImageDataQuarterTurns } from 'src/logic/photo-trace/rotate-image-data';
import type { PhotoTraceResult } from 'src/logic/photo-trace/trace-from-raster';

////////
////////

/**
 * Command entry: pick a photo, fit the page, trace that crop, and queue transcription.
 */
export const insertWritingFromPhoto = (plugin: InkPlugin, editor: Editor): void => {
	const modal = new WritingPhotoPickerModal(plugin, (file) => {
		void importWritingFromPhoto(plugin, editor, file);
	});
	modal.open();
};

async function importWritingFromPhoto(
	plugin: InkPlugin,
	editor: Editor,
	photoFile: File,
): Promise<void> {
	const activeFile = plugin.app.workspace.getActiveFile();
	const worker = new PhotoTraceWorkerClient(plugin);
	let cancelled = false;
	try {
		const photoCanvas = await decodePhotoToCanvas(photoFile, PHOTO_TRACE_DEFAULT_EDGE_PX);
		const photoImage = imageDataFromCanvas(photoCanvas);
		const photoGray = luminanceFromCanvas(photoCanvas);
		const detectedQuad = findPageQuad(photoGray, photoCanvas.width, photoCanvas.height, photoImage.data);
		const defaultCorners = detectedQuad?.corners ?? fullFrameCorners(photoCanvas.width, photoCanvas.height);
		let corners = defaultCorners;
		let quarterTurnsClockwise = 0;
		let convertChoice: {
			target: WritingPhotoConvertTarget;
			adjustment: PagePhotoAdjustment;
			inkSensitivity: number;
			noiseCleanup: boolean;
		} | null = null;
		let pageCanvas: HTMLCanvasElement | null = null;

		while (!convertChoice) {
			const crop = await openWritingPhotoCropModal(
				plugin,
				photoImage,
				corners,
				quarterTurnsClockwise,
			);
			if (!crop || cancelled) {
				worker.cancel();
				return;
			}
			corners = crop.corners;
			quarterTurnsClockwise = crop.quarterTurnsClockwise;
			// Warp the turned photo so the pins match the pixels the user just saw.
			const orientedPhoto = rotateImageDataQuarterTurns(photoImage, quarterTurnsClockwise);
			const straightenProgress = openWritingPhotoProgressModal({
				plugin,
				onCancel: () => {
					cancelled = true;
					worker.cancel();
				},
			});
			straightenProgress.setStage('Straightening the page…');
			try {
				const warped = await worker.warp({
					rgba: orientedPhoto.data,
					width: orientedPhoto.width,
					height: orientedPhoto.height,
					corners,
					maxEdgePx: PHOTO_TRACE_DEFAULT_EDGE_PX,
					onProgress: (stage, percent) => straightenProgress.setStage(stage, percent),
				});
				if (cancelled) {
					straightenProgress.close();
					return;
				}
				pageCanvas = canvasFromRgba(warped.rgba, warped.width, warped.height);
				const previewImage = scaleImageDataToMaxEdge(
					new ImageData(warped.rgba, warped.width, warped.height),
					PHOTO_TRACE_PREVIEW_MAX_EDGE_PX,
				);
				straightenProgress.close();
				const adjustChoice = await openWritingPhotoAdjustModal(plugin, previewImage);
				if (adjustChoice.action === 'back') continue;
				if (adjustChoice.action === 'cancel') {
					worker.cancel();
					return;
				}
				convertChoice = {
					target: adjustChoice.target,
					adjustment: adjustChoice.adjustment,
					inkSensitivity: adjustChoice.inkSensitivity,
					noiseCleanup: adjustChoice.noiseCleanup,
				};
			} catch (error) {
				if (error instanceof PhotoTraceCancelledError || cancelled) {
					straightenProgress.close();
					return;
				}
				straightenProgress.setStage(
					error instanceof Error ? error.message : 'Could not straighten the page.',
				);
				return;
			}
		}

		if (!pageCanvas) {
			worker.cancel();
			return;
		}
		// Flatten before the trace. The worker skips this when the page is already warped.
		flattenPageIlluminationCanvasInPlace(pageCanvas);

		const convertProgress = openWritingPhotoProgressModal({
			plugin,
			onCancel: () => {
				cancelled = true;
				worker.cancel();
			},
		});
		let traceResult: PhotoTraceResult | null = null;
		try {
			const maxEdgePx = PHOTO_TRACE_DEFAULT_EDGE_PX;
			const sauvolaK = photoTraceSauvolaK(convertChoice.inkSensitivity);
			const pageImage = imageDataFromCanvas(pageCanvas);
			convertProgress.setStage('Tracing locally…');
			// The adjust step already warped and flattened at 1600px; reuse that page directly.
			const converted = await worker.convert({
				rgba: pageImage.data,
				width: pageImage.width,
				height: pageImage.height,
				corners,
				maxEdgePx,
				adjustment: convertChoice.adjustment,
				dropLargeBorderComponents: true,
				simplifyEpsilon: photoTraceSimplifyEpsilon(PHOTO_TRACE_DEFAULT_DETAIL),
				minPolylineLengthPx: photoTraceMinPolylineLength(PHOTO_TRACE_DEFAULT_DETAIL),
				sauvolaK,
				noiseCleanup: convertChoice.noiseCleanup,
				alreadyWarped: true,
				onProgress: (stage: string, percent?: number) => convertProgress.setStage(stage, percent),
			});
			if (cancelled) return;
			traceResult = converted;
		} catch (error) {
			if (error instanceof PhotoTraceCancelledError || cancelled) {
				convertProgress.close();
				return;
			}
			convertProgress.setStage(error instanceof Error ? error.message : 'Could not trace the page.');
			return;
		} finally {
			if (traceResult) convertProgress.close();
			worker.cancel();
		}

		if (!traceResult || cancelled) return;

		const isDrawingTarget = convertChoice.target === 'drawing';
		const svgPath = isDrawingTarget
			? await getNewTimestampedDrawingSvgFilepath(plugin, activeFile)
			: await getNewTimestampedWritingSvgFilepath(plugin, activeFile);
		const { basename } = parseFilepath(svgPath);
		const jpegFileName = `${basename.replace(/\.svg$/i, '')}.jpg`;
		const jpegVaultPath = buildWritingPhotoJpegVaultPath(svgPath, jpegFileName);
		const sourceImageRelative = buildWritingPhotoSourceImageRelativePath(jpegFileName);

		await createFoldersForFilepath(plugin, jpegVaultPath);
		await createFoldersForFilepath(plugin, svgPath);
		// The saved photo matches the turn chosen with the corners. The crop itself stays in memory.
		const jpegBuffer = await encodeWritingPhotoJpeg(photoFile, quarterTurnsClockwise);
		await plugin.app.vault.createBinary(jpegVaultPath, jpegBuffer);

		let pageDataStr: string;
		if (isDrawingTarget) {
			const inkCanvasSnapshot: InkCanvasSnapshot = {
				version: 1,
				strokes: traceResult.strokes,
				gridEnabled: plugin.settings.drawingGridEnabledByDefault ?? DEFAULT_SETTINGS.drawingGridEnabledByDefault,
			};
			const svgString = renderStrokesToSvg(traceResult.strokes, inkCanvasSnapshot);
			const pageData = buildInkCanvasDrawingFileData({
				inkCanvasSnapshot,
				svgString,
				sourceImage: sourceImageRelative,
				transcriptFrom: 'photo',
			});
			pageDataStr = buildFileStr(pageData);
		} else {
			const inkCanvasSnapshot: InkCanvasSnapshot = {
				version: 1,
				strokes: traceResult.strokes,
				gridEnabled: false,
				writingLineHeight: traceResult.writingLineHeight,
			};
			const svgString = renderWritingStrokesToSvg(
				traceResult.strokes,
				inkCanvasSnapshot,
				WRITING_PAGE_WIDTH,
			);
			const pageData = buildInkCanvasWritingFileData({
				inkCanvasSnapshot,
				svgString,
				sourceImage: sourceImageRelative,
				transcriptFrom: 'photo',
				writingLineHeight: traceResult.writingLineHeight,
			});
			pageDataStr = buildFileStr(pageData);
		}

		suppressAutoTranscribeOnNextVaultModify(svgPath);
		const fileRef = await plugin.app.vault.create(svgPath, pageDataStr);

		recordRecentFileSelection(isDrawingTarget ? 'inkDrawing' : 'inkWriting', fileRef.path);
		// Display mode is session memory, separate from lock. Starting on photo
		// made the first lock jump back to the photo pane.
		setInkEmbedDisplayMode(fileRef.path, 'ink');

		let embedStr: string;
		if (isDrawingTarget) {
			const embedSettings = buildDrawingEmbedSettingsFromStrokes(traceResult.strokes) ?? undefined;
			embedStr = buildDrawingEmbed(
				fileRef.path,
				embedSettings ? { embedSettings } : { writingAlignedViewBox: true },
			);
		} else {
			const aspectRatio = await readWritingFileAspectRatio(plugin, fileRef);
			embedStr = buildWritingEmbed(
				fileRef.path,
				aspectRatio != null ? { aspectRatio } : undefined,
			);
		}
		activateNextEmbed();
		const positionForEmbed = editor.getCursor();
		editor.replaceRange(embedStr, positionForEmbed);
		const positionForCursor = { ...positionForEmbed };
		const embedLines = embedStr.split(/\r\n|\r|\n/);
		positionForCursor.line += embedLines.length;
		editor.setCursor(positionForCursor);

		await enqueueTranscriptionAfterPhotoImport(fileRef.path);
		new Notice(isDrawingTarget ? 'Drawing from the photo is ready.' : 'Handwriting from the photo is ready.');
	} catch (error) {
		worker.cancel();
		if (error instanceof PhotoTraceCancelledError || (error instanceof Error && error.message.includes('cancelled'))) {
			return;
		}
		new Notice(`Could not import handwriting photo: ${String(error)}`);
	}
}
