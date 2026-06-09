import { DEFAULT_SETTINGS } from 'src/types/plugin-settings';
import { PLUGIN_VERSION, WRITING_PAGE_WIDTH } from 'src/constants';
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

	const { writingLineHeight: _writingLineHeight, camera: _camera, ...snapshotRest } =
		cloneInkCanvasSnapshot(data.inkCanvas);
	const inkCanvasSnapshot: InkCanvasSnapshot = {
		...snapshotRest,
		gridEnabled,
	};

	const svgString = renderStrokesToSvg(inkCanvasSnapshot.strokes, inkCanvasSnapshot);
	const fileData = buildInkCanvasDrawingFileData({ inkCanvasSnapshot, svgString });
	fileData.meta.pluginVersion = PLUGIN_VERSION;
	if (data.meta.transcript) {
		fileData.meta.transcript = data.meta.transcript;
	}
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

	const { camera: _camera, ...snapshotRest } = cloneInkCanvasSnapshot(data.inkCanvas);
	const inkCanvasSnapshot: InkCanvasSnapshot = {
		...snapshotRest,
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
	if (inkCanvasSnapshot.writingLineHeight != null) {
		fileData.meta.writingLineHeight = inkCanvasSnapshot.writingLineHeight;
	}
	return fileData;
}
