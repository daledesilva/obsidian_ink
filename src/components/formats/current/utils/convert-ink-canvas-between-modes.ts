import { DEFAULT_SETTINGS } from 'src/types/plugin-settings';
import { PLUGIN_VERSION, WRITING_PAGE_WIDTH } from 'src/constants';
import { fitStrokesForDrawingToWriting } from 'src/ink-canvas/fit-strokes-for-mode-conversion';
import { renderStrokesToSvg, renderWritingStrokesToSvg } from 'src/ink-canvas/svg-export';
import type { InkCanvasSnapshot } from 'src/ink-canvas/types';
import { InkFileData } from '../types/file-data';
import {
	buildInkCanvasDrawingFileData,
	buildInkCanvasWritingFileData,
} from './build-file-data';
import { isInkCanvasFile } from './ink-file-storage-engine';

////////
////////

/**
 * Ink-canvas conversion rebuilds file data, so the photo link would otherwise be dropped.
 * The Photo tab and transcription resolve these paths beside the SVG.
 */
function copyPhotoTraceMeta(from: InkFileData, to: InkFileData): void {
	if (from.meta.sourceImage) {
		to.meta.sourceImage = from.meta.sourceImage;
	}
	if (from.meta.transcriptImage) {
		to.meta.transcriptImage = from.meta.transcriptImage;
	}
	if (from.meta.transcriptFrom) {
		to.meta.transcriptFrom = from.meta.transcriptFrom;
	}
}

function cloneInkCanvasSnapshot(snapshot: InkCanvasSnapshot): InkCanvasSnapshot {
	return {
		...snapshot,
		strokes: snapshot.strokes.map((stroke) => ({
			...stroke,
			points: stroke.points.map((point) => [...point] as typeof point),
			style: { ...stroke.style },
			offset: { ...stroke.offset },
		})),
	};
}

/**
 * Pure data transformation: converts an inkWriting ink-canvas InkFileData to inkDrawing.
 * Updates snapshot mode fields and re-renders the preview SVG from strokes.
 */
export function convertWriteInkCanvasDataToDraw(
	data: InkFileData,
	gridEnabled: boolean = DEFAULT_SETTINGS.drawingGridEnabledByDefault,
): InkFileData {
	if (!isInkCanvasFile(data) || !data.inkCanvas) {
		throw new Error('convertWriteInkCanvasDataToDraw requires an ink-canvas inkWriting file');
	}
	if (data.meta.fileType !== 'inkWriting') {
		throw new Error('convertWriteInkCanvasDataToDraw requires fileType inkWriting');
	}

	const snapshotClone = cloneInkCanvasSnapshot(data.inkCanvas);
	delete snapshotClone.writingLineHeight;
	delete snapshotClone.camera;
	const inkCanvasSnapshot: InkCanvasSnapshot = {
		...snapshotClone,
		gridEnabled,
	};

	const svgString = renderStrokesToSvg(inkCanvasSnapshot.strokes, inkCanvasSnapshot);
	const fileData = buildInkCanvasDrawingFileData({ inkCanvasSnapshot, svgString });
	fileData.meta.pluginVersion = PLUGIN_VERSION;
	if (data.meta.transcript) {
		fileData.meta.transcript = data.meta.transcript;
	}
	copyPhotoTraceMeta(data, fileData);
	return fileData;
}

/**
 * Pure data transformation: converts an inkDrawing ink-canvas InkFileData to inkWriting.
 * Updates snapshot mode fields and re-renders the preview SVG from strokes.
 */
export function convertDrawInkCanvasDataToWrite(
	data: InkFileData,
	defaultWritingLineHeight: number,
): InkFileData {
	if (!isInkCanvasFile(data) || !data.inkCanvas) {
		throw new Error('convertDrawInkCanvasDataToWrite requires an ink-canvas inkDrawing file');
	}
	if (data.meta.fileType !== 'inkDrawing') {
		throw new Error('convertDrawInkCanvasDataToWrite requires fileType inkDrawing');
	}

	const writingLineHeight =
		data.inkCanvas.writingLineHeight ?? defaultWritingLineHeight;

	const snapshotRest = cloneInkCanvasSnapshot(data.inkCanvas);
	delete snapshotRest.camera;
	const fittedStrokes = fitStrokesForDrawingToWriting(
		snapshotRest.strokes,
		writingLineHeight,
		WRITING_PAGE_WIDTH,
	);
	const inkCanvasSnapshot: InkCanvasSnapshot = {
		...snapshotRest,
		strokes: fittedStrokes,
		gridEnabled: false,
		writingLineHeight,
	};

	const svgString = renderWritingStrokesToSvg(
		inkCanvasSnapshot.strokes,
		inkCanvasSnapshot,
		WRITING_PAGE_WIDTH,
	);
	const fileData = buildInkCanvasWritingFileData({ inkCanvasSnapshot, svgString });
	fileData.meta.pluginVersion = PLUGIN_VERSION;
	if (data.meta.transcript) {
		fileData.meta.transcript = data.meta.transcript;
	}
	copyPhotoTraceMeta(data, fileData);
	if (inkCanvasSnapshot.writingLineHeight != null) {
		fileData.meta.writingLineHeight = inkCanvasSnapshot.writingLineHeight;
	}
	return fileData;
}
