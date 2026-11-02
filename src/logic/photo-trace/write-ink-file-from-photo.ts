import type { Editor, TFile } from 'obsidian';
import type InkPlugin from 'src/main';
import {
	buildDrawingEmbed,
	buildWritingEmbed,
} from 'src/components/formats/current/utils/build-embeds';
import {
	buildInkCanvasDrawingFileData,
	buildInkCanvasWritingFileData,
} from 'src/components/formats/current/utils/build-file-data';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { buildDrawingEmbedSettingsFromStrokes } from 'src/logic/utils/build-drawing-embed-settings-from-file';
import { createFoldersForFilepath } from 'src/logic/utils/createFoldersForFilepath';
import {
	getNewTimestampedDrawingSvgFilepath,
	getNewTimestampedWritingSvgFilepath,
} from 'src/logic/utils/file-manipulation';
import { parseFilepath } from 'src/logic/utils/parseFilepath';
import { activateNextEmbed, recordRecentFileSelection } from 'src/logic/utils/storage';
import { readWritingFileAspectRatio } from 'src/logic/utils/writing-embed-aspect-ratio';
import { setInkEmbedDisplayMode } from 'src/logic/ink-embed-display-mode';
import {
	enqueueTranscriptionAfterPhotoImport,
	suppressAutoTranscribeOnNextVaultModify,
} from 'src/logic/handwriting-transcription-queue';
import { encodeWritingPhotoJpeg } from './encode-writing-photo-jpeg';
import type { InkPhotoConvertTarget } from './photo-convert-target';
import type { PhotoTraceResult } from './trace-from-raster';
import {
	buildWritingPhotoJpegVaultPath,
	buildWritingPhotoSourceImageRelativePath,
} from './writing-photo-paths';
import { renderStrokesToSvg, renderWritingStrokesToSvg } from 'src/ink-canvas/svg-export';
import type { InkCanvasSnapshot } from 'src/ink-canvas/types';
import { WRITING_PAGE_WIDTH } from 'src/constants';
import { DEFAULT_SETTINGS } from 'src/types/plugin-settings';

//////////
//////////

export interface CreateInkFileFromPhotoTraceOptions {
	plugin: InkPlugin;
	editor: Editor;
	/** The picked photo. Its own turn count is baked into the saved JPEG. */
	photoFile: File;
	quarterTurnsClockwise: number;
	traceResult: PhotoTraceResult;
	target: InkPhotoConvertTarget;
	/** The note receiving the embed; decides the attachment folder. */
	activeFile: TFile | null;
	/**
	 * Only the first file of a batch may claim the activate-next-embed flag. It is a
	 * single read-and-clear key, so a later call would focus an earlier embed.
	 */
	activateImmediately: boolean;
}

export interface CreatedInkFileFromPhoto {
	filePath: string;
	target: InkPhotoConvertTarget;
}

/**
 * Writes the traced page as a new ink file beside its turned JPEG and inserts the
 * embed at the cursor. Nothing is returned when the note has no editor position left
 * to write to; the caller reports the count of files it actually created.
 */
export async function createInkFileFromPhotoTrace(
	options: CreateInkFileFromPhotoTraceOptions,
): Promise<CreatedInkFileFromPhoto> {
	const isDrawingTarget = options.target === 'drawing';
	const svgPath = isDrawingTarget
		? await getNewTimestampedDrawingSvgFilepath(options.plugin, options.activeFile)
		: await getNewTimestampedWritingSvgFilepath(options.plugin, options.activeFile);
	const { basename } = parseFilepath(svgPath);
	const jpegFileName = `${basename.replace(/\.svg$/i, '')}.jpg`;
	const jpegVaultPath = buildWritingPhotoJpegVaultPath(svgPath, jpegFileName);
	const sourceImageRelative = buildWritingPhotoSourceImageRelativePath(jpegFileName);

	await createFoldersForFilepath(options.plugin, jpegVaultPath);
	await createFoldersForFilepath(options.plugin, svgPath);
	// The saved photo matches the turn chosen with the corners. The crop itself stays in memory.
	const jpegBuffer = await encodeWritingPhotoJpeg(options.photoFile, options.quarterTurnsClockwise);
	await options.plugin.app.vault.createBinary(jpegVaultPath, jpegBuffer);

	let pageDataStr: string;
	if (isDrawingTarget) {
		const inkCanvasSnapshot: InkCanvasSnapshot = {
			version: 1,
			strokes: options.traceResult.strokes,
			gridEnabled:
				options.plugin.settings.drawingGridEnabledByDefault ??
				DEFAULT_SETTINGS.drawingGridEnabledByDefault,
		};
		const svgString = renderStrokesToSvg(options.traceResult.strokes, inkCanvasSnapshot);
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
			strokes: options.traceResult.strokes,
			gridEnabled: false,
			writingLineHeight: options.traceResult.writingLineHeight,
		};
		const svgString = renderWritingStrokesToSvg(
			options.traceResult.strokes,
			inkCanvasSnapshot,
			WRITING_PAGE_WIDTH,
		);
		const pageData = buildInkCanvasWritingFileData({
			inkCanvasSnapshot,
			svgString,
			sourceImage: sourceImageRelative,
			transcriptFrom: 'photo',
			writingLineHeight: options.traceResult.writingLineHeight,
		});
		pageDataStr = buildFileStr(pageData);
	}

	suppressAutoTranscribeOnNextVaultModify(svgPath);
	const fileRef = await options.plugin.app.vault.create(svgPath, pageDataStr);

	recordRecentFileSelection(isDrawingTarget ? 'inkDrawing' : 'inkWriting', fileRef.path);
	// Display mode is session memory, separate from lock. Starting on photo
	// made the first lock jump back to the photo pane.
	setInkEmbedDisplayMode(fileRef.path, 'ink');

	let embedStr: string;
	if (isDrawingTarget) {
		const embedSettings = buildDrawingEmbedSettingsFromStrokes(options.traceResult.strokes) ?? undefined;
		embedStr = buildDrawingEmbed(
			fileRef.path,
			embedSettings ? { embedSettings } : { writingAlignedViewBox: true },
		);
	} else {
		const aspectRatio = await readWritingFileAspectRatio(options.plugin, fileRef);
		embedStr = buildWritingEmbed(fileRef.path, aspectRatio != null ? { aspectRatio } : undefined);
	}
	if (options.activateImmediately) activateNextEmbed();

	// Each embed lands at the cursor, then the cursor moves past it so the next photo
	// in the batch appends underneath instead of overwriting this one.
	const positionForEmbed = options.editor.getCursor();
	options.editor.replaceRange(embedStr, positionForEmbed);
	const positionForCursor = { ...positionForEmbed };
	const embedLines = embedStr.split(/\r\n|\r|\n/);
	positionForCursor.line += embedLines.length;
	options.editor.setCursor(positionForCursor);

	await enqueueTranscriptionAfterPhotoImport(fileRef.path);
	return { filePath: fileRef.path, target: options.target };
}
