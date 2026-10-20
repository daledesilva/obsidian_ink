import InkPlugin from 'src/main';
import { Editor, Notice } from 'obsidian';
import { activateNextEmbed, recordRecentFileSelection } from 'src/logic/utils/storage';
import { buildWritingEmbed } from 'src/components/formats/current/utils/build-embeds';
import { readWritingFileAspectRatio } from 'src/logic/utils/writing-embed-aspect-ratio';
import { WritingPhotoPickerModal } from 'src/components/dom-components/modals/writing-photo-picker-modal/writing-photo-picker-modal';
import { openWritingPhotoCropModal } from 'src/components/dom-components/modals/writing-photo-crop-modal/writing-photo-crop-modal';
import { openWritingPhotoAdjustModal } from 'src/components/dom-components/modals/writing-photo-adjust-modal/writing-photo-adjust-modal';
import { openWritingPhotoProgressModal } from 'src/components/dom-components/modals/writing-photo-progress-modal/writing-photo-progress-modal';
import { encodeWritingPhotoJpeg } from 'src/logic/photo-trace/encode-writing-photo-jpeg';
import { getNewTimestampedWritingSvgFilepath } from 'src/logic/utils/file-manipulation';
import { createFoldersForFilepath } from 'src/logic/utils/createFoldersForFilepath';
import { parseFilepath } from 'src/logic/utils/parseFilepath';
import {
	buildWritingPhotoJpegVaultPath,
	buildWritingPhotoSourceImageRelativePath,
} from 'src/logic/photo-trace/writing-photo-paths';
import {
	canvasFromRgba,
	canvasJpegObjectUrl,
	decodePhotoToCanvas,
	imageDataFromCanvas,
	luminanceFromCanvas,
	scaleImageDataToMaxEdge,
} from 'src/logic/photo-trace/run-photo-trace';
import {
	PHOTO_TRACE_DEFAULT_EDGE_PX,
	PHOTO_TRACE_PREVIEW_MAX_EDGE_PX,
	photoTraceMaxEdgePx,
	photoTraceMinPolylineLength,
	photoTraceSimplifyEpsilon,
} from 'src/logic/photo-trace/trace-from-raster';
import {
	findPageQuad,
	fullFrameCorners,
	quadMatchesFullFrame,
	type PagePoint,
} from 'src/logic/photo-trace/find-page-quad';
import { flattenPageIlluminationCanvasInPlace } from 'src/logic/photo-trace/flatten-page-illumination';
import { encodeCanvasJpeg } from 'src/logic/photo-trace/warp-page-quad';
import { buildInkCanvasWritingFileData } from 'src/components/formats/current/utils/build-file-data';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { renderWritingStrokesToSvg } from 'src/ink-canvas/svg-export';
import type { InkCanvasSnapshot } from 'src/ink-canvas/types';
import { WRITING_PAGE_WIDTH } from 'src/constants';
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
import { hasLinkedAlmostUsefulAccount } from 'src/logic/almostuseful/almostuseful-session';
import {
	buildHandwritingVectorJobRequest,
	HandwritingVectorJobError,
	postHandwritingVectorJob,
} from 'src/logic/almostuseful/almostuseful-handwriting-vector';
import { mapHandwritingVectorStrokesToInk } from 'src/logic/photo-trace/map-handwriting-vector-strokes';
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
	let previewUrl: string | null = null;
	const worker = new PhotoTraceWorkerClient(plugin);
	let cancelled = false;
	try {
		const jpegBuffer = await encodeWritingPhotoJpeg(photoFile);
		const photoCanvas = await decodePhotoToCanvas(photoFile, PHOTO_TRACE_DEFAULT_EDGE_PX);
		const photoGray = luminanceFromCanvas(photoCanvas);
		const detectedQuad = findPageQuad(photoGray, photoCanvas.width, photoCanvas.height);
		const defaultCorners = detectedQuad?.corners ?? fullFrameCorners(photoCanvas.width, photoCanvas.height);
		const photoPreviewUrl = await canvasJpegObjectUrl(photoCanvas);
		previewUrl = photoPreviewUrl;
		const photoImage = imageDataFromCanvas(photoCanvas);
		let corners = defaultCorners;
		let useFullFrame = false;
		let convertChoice: { adjustment: PagePhotoAdjustment; detail: number; resolution: number } | null = null;
		let pageCanvas: HTMLCanvasElement | null = null;

		while (!convertChoice) {
			const chosenCorners = await openWritingPhotoCropModal(
				plugin,
				photoPreviewUrl,
				photoCanvas.width,
				photoCanvas.height,
				corners,
			);
			if (!chosenCorners || cancelled) {
				URL.revokeObjectURL(photoPreviewUrl);
				previewUrl = null;
				worker.cancel();
				return;
			}
			corners = chosenCorners;
			useFullFrame = quadMatchesFullFrame(chosenCorners, photoCanvas.width, photoCanvas.height);
			const straightenProgress = openWritingPhotoProgressModal(plugin, () => {
				cancelled = true;
				worker.cancel();
			});
			straightenProgress.setStage('Straightening the page…');
			try {
				const warped = await worker.warp({
					rgba: photoImage.data,
					width: photoImage.width,
					height: photoImage.height,
					corners: chosenCorners,
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
				URL.revokeObjectURL(photoPreviewUrl);
				previewUrl = null;
				if (adjustChoice.action === 'cancel') {
					worker.cancel();
					return;
				}
				convertChoice = {
					adjustment: adjustChoice.adjustment,
					detail: adjustChoice.detail,
					resolution: adjustChoice.resolution,
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
		// Flatten lighting before the portal JPEG so shadows are not sent as black corners.
		flattenPageIlluminationCanvasInPlace(pageCanvas);

		const convertProgress = openWritingPhotoProgressModal(plugin, () => {
			cancelled = true;
			worker.cancel();
		});
		let traceResult: PhotoTraceResult | null = null;
		try {
			const usePortalVector = hasLinkedAlmostUsefulAccount();
			if (usePortalVector && !cancelled) {
				convertProgress.setStage('Asking Almost Useful…');
				try {
					const pageBuffer = await encodeCanvasJpeg(pageCanvas);
					const mediaBase64 = arrayBufferToBase64(pageBuffer);
					const vector = await postHandwritingVectorJob(
						buildHandwritingVectorJobRequest({ mediaBase64 }),
						{ isCancelled: () => cancelled },
					);
					if (cancelled) return;
					traceResult = mapHandwritingVectorStrokesToInk(
						vector.strokes,
						pageCanvas.width,
						pageCanvas.height,
					);
				} catch (error) {
					if (cancelled || (error instanceof HandwritingVectorJobError && error.code === 'cancelled')) {
						return;
					}
					const message = error instanceof Error ? error.message : 'Almost Useful tracing failed';
					convertProgress.setStage(`${message}. Tracing locally…`);
				}
			}

			if (!traceResult && !cancelled) {
				const maxEdgePx = photoTraceMaxEdgePx(convertChoice.resolution);
				let convertRgba = photoImage.data;
				let convertWidth = photoImage.width;
				let convertHeight = photoImage.height;
				let convertCorners = corners;
				if (maxEdgePx > PHOTO_TRACE_DEFAULT_EDGE_PX) {
					const fullCanvas = await decodePhotoToCanvas(photoFile, maxEdgePx);
					const fullImage = imageDataFromCanvas(fullCanvas);
					convertRgba = fullImage.data;
					convertWidth = fullImage.width;
					convertHeight = fullImage.height;
					convertCorners = scaleCorners(
						corners,
						photoCanvas.width,
						photoCanvas.height,
						fullCanvas.width,
						fullCanvas.height,
					);
				}
				convertProgress.setStage('Tracing locally…');
				const converted = await worker.convert({
					rgba: convertRgba,
					width: convertWidth,
					height: convertHeight,
					corners: convertCorners,
					maxEdgePx,
					adjustment: convertChoice.adjustment,
					dropLargeBorderComponents: true,
					simplifyEpsilon: photoTraceSimplifyEpsilon(convertChoice.detail),
					minPolylineLengthPx: photoTraceMinPolylineLength(convertChoice.detail),
					onProgress: (stage, percent) => convertProgress.setStage(stage, percent),
				});
				traceResult = converted;
				pageCanvas = canvasFromRgba(converted.pageRgba, converted.pageWidth, converted.pageHeight);
			}
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

		const svgPath = await getNewTimestampedWritingSvgFilepath(plugin, activeFile);
		const { basename } = parseFilepath(svgPath);
		const jpegFileName = `${basename.replace(/\.svg$/i, '')}.jpg`;
		const jpegVaultPath = buildWritingPhotoJpegVaultPath(svgPath, jpegFileName);
		const sourceImageRelative = buildWritingPhotoSourceImageRelativePath(jpegFileName);

		await createFoldersForFilepath(plugin, jpegVaultPath);
		await createFoldersForFilepath(plugin, svgPath);
		await plugin.app.vault.createBinary(jpegVaultPath, jpegBuffer);

		let transcriptImageRelative: string | undefined;
		if (!useFullFrame) {
			const pageFileName = `${basename.replace(/\.svg$/i, '')}-page.jpg`;
			const pageVaultPath = buildWritingPhotoJpegVaultPath(svgPath, pageFileName);
			const pageBuffer = await encodeCanvasJpeg(pageCanvas);
			await plugin.app.vault.createBinary(pageVaultPath, pageBuffer);
			transcriptImageRelative = buildWritingPhotoSourceImageRelativePath(pageFileName);
		}

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
			transcriptImage: transcriptImageRelative,
			transcriptFrom: 'photo',
			writingLineHeight: traceResult.writingLineHeight,
		});
		const pageDataStr = buildFileStr(pageData);
		suppressAutoTranscribeOnNextVaultModify(svgPath);
		const fileRef = await plugin.app.vault.create(svgPath, pageDataStr);

		recordRecentFileSelection('inkWriting', fileRef.path);
		setInkEmbedDisplayMode(fileRef.path, 'photo');

		const aspectRatio = await readWritingFileAspectRatio(plugin, fileRef);
		const embedStr = buildWritingEmbed(
			fileRef.path,
			aspectRatio != null ? { aspectRatio } : undefined,
		);
		activateNextEmbed();
		const positionForEmbed = editor.getCursor();
		editor.replaceRange(embedStr, positionForEmbed);
		const positionForCursor = { ...positionForEmbed };
		const embedLines = embedStr.split(/\r\n|\r|\n/);
		positionForCursor.line += embedLines.length;
		editor.setCursor(positionForCursor);

		await enqueueTranscriptionAfterPhotoImport(fileRef.path);
		new Notice('Handwriting from the photo is ready.');
	} catch (error) {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		worker.cancel();
		if (error instanceof PhotoTraceCancelledError || (error instanceof Error && error.message.includes('cancelled'))) {
			return;
		}
		new Notice(`Could not import handwriting photo: ${String(error)}`);
	}
}

function scaleCorners(
	corners: [PagePoint, PagePoint, PagePoint, PagePoint],
	fromWidth: number,
	fromHeight: number,
	toWidth: number,
	toHeight: number,
): [PagePoint, PagePoint, PagePoint, PagePoint] {
	const scaleX = toWidth / Math.max(1, fromWidth);
	const scaleY = toHeight / Math.max(1, fromHeight);
	return corners.map((corner) => ({
		x: corner.x * scaleX,
		y: corner.y * scaleY,
	})) as [PagePoint, PagePoint, PagePoint, PagePoint];
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}
