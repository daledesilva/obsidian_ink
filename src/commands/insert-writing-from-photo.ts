import InkPlugin from 'src/main';
import { Editor, Notice } from 'obsidian';
import { activateNextEmbed, recordRecentFileSelection } from 'src/logic/utils/storage';
import { buildWritingEmbed } from 'src/components/formats/current/utils/build-embeds';
import { readWritingFileAspectRatio } from 'src/logic/utils/writing-embed-aspect-ratio';
import { WritingPhotoPickerModal } from 'src/components/dom-components/modals/writing-photo-picker-modal/writing-photo-picker-modal';
import { openWritingPhotoCropModal } from 'src/components/dom-components/modals/writing-photo-crop-modal/writing-photo-crop-modal';
import { openWritingPhotoAdjustModal } from 'src/components/dom-components/modals/writing-photo-adjust-modal/writing-photo-adjust-modal';
import { encodeWritingPhotoJpeg } from 'src/logic/photo-trace/encode-writing-photo-jpeg';
import { getNewTimestampedWritingSvgFilepath } from 'src/logic/utils/file-manipulation';
import { createFoldersForFilepath } from 'src/logic/utils/createFoldersForFilepath';
import { parseFilepath } from 'src/logic/utils/parseFilepath';
import {
	buildWritingPhotoJpegVaultPath,
	buildWritingPhotoSourceImageRelativePath,
} from 'src/logic/photo-trace/writing-photo-paths';
import { decodePhotoToCanvas, luminanceFromCanvas, runPhotoTrace, scaleCanvasToMaxEdge } from 'src/logic/photo-trace/run-photo-trace';
import {
	photoTraceMaxEdgePx,
	photoTraceMinPolylineLength,
	photoTraceSimplifyEpsilon,
} from 'src/logic/photo-trace/trace-from-raster';
import {
	findPageQuad,
	fullFrameCorners,
	quadMatchesFullFrame,
} from 'src/logic/photo-trace/find-page-quad';
import { encodeCanvasJpeg, warpQuadToCanvas } from 'src/logic/photo-trace/warp-page-quad';
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
	try {
		const jpegBuffer = await encodeWritingPhotoJpeg(photoFile);
		const jpegBlob = new Blob([jpegBuffer], { type: 'image/jpeg' });
		// Trace from the original pixels at working resolution. The vault JPEG stays smaller.
		const photoCanvas = await decodePhotoToCanvas(photoFile);
		const photoGray = luminanceFromCanvas(photoCanvas);
		const detectedQuad = findPageQuad(photoGray, photoCanvas.width, photoCanvas.height);
		const defaultCorners = detectedQuad?.corners ?? fullFrameCorners(photoCanvas.width, photoCanvas.height);
		const photoPreviewUrl = URL.createObjectURL(jpegBlob);
		previewUrl = photoPreviewUrl;
		// Back from the adjust step returns here with the same pins. Cancel on either step writes nothing.
		let corners = defaultCorners;
		let useFullFrame = false;
		let pageCanvas = photoCanvas;
		let adjustedCanvas: HTMLCanvasElement | null = null;
		let traceDetail = 0;
		let traceResolution = 0;
		while (!adjustedCanvas) {
			const chosenCorners = await openWritingPhotoCropModal(
				plugin,
				photoPreviewUrl,
				photoCanvas.width,
				photoCanvas.height,
				corners,
			);
			if (!chosenCorners) {
				URL.revokeObjectURL(photoPreviewUrl);
				previewUrl = null;
				return;
			}
			corners = chosenCorners;
			useFullFrame = quadMatchesFullFrame(chosenCorners, photoCanvas.width, photoCanvas.height);
			pageCanvas = useFullFrame ? photoCanvas : warpQuadToCanvas(photoCanvas, chosenCorners);
			const adjustChoice = await openWritingPhotoAdjustModal(plugin, pageCanvas);
			if (adjustChoice.action === 'back') continue;
			URL.revokeObjectURL(photoPreviewUrl);
			previewUrl = null;
			if (adjustChoice.action === 'cancel') return;
			adjustedCanvas = adjustChoice.canvas;
			traceDetail = adjustChoice.detail;
			traceResolution = adjustChoice.resolution;
		}
		// Colour and contrast steer the pixels. Detail and Resolution steer the tracer.
		// The Photo tab and the transcript JPEG stay the real page.
		const traceCanvas = scaleCanvasToMaxEdge(adjustedCanvas, photoTraceMaxEdgePx(traceResolution));
		const pageGray = luminanceFromCanvas(traceCanvas);

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

		const traceResult = await runPhotoTrace(plugin, {
			width: traceCanvas.width,
			height: traceCanvas.height,
			gray: pageGray,
			dropLargeBorderComponents: !useFullFrame,
			simplifyEpsilon: photoTraceSimplifyEpsilon(traceDetail),
			minPolylineLengthPx: photoTraceMinPolylineLength(traceDetail),
		});

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
	} catch (error) {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		new Notice(`Could not import handwriting photo: ${String(error)}`);
	}
}
