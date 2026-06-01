import { TFile } from "obsidian";
import { TLShapeId } from "@tldraw/tldraw";
import InkPlugin from "src/main";
import { InkFileData } from "../types/file-data";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { convertWriteInkCanvasDataToDraw } from "./convert-ink-canvas-between-modes";
import { buildFileStr } from "./buildFileStr";
import { isInkCanvasFile } from "./ink-file-storage-engine";

////////
////////

/**
 * Pure data transformation: converts an inkWriting InkFileData to inkDrawing.
 * Removes writing-container and writing-lines shapes from the tldraw store
 * and updates the fileType metadata.
 */
export function convertWriteDataToDraw(data: InkFileData): InkFileData {
	const store = data.tldraw.document.store;

	const updatedStore = { ...store };
	delete updatedStore['shape:writing-container' as TLShapeId];
	delete updatedStore['shape:writing-lines' as TLShapeId];

	const existingSession = data.tldraw.session ?? {};
	const sessionWithGridOn = { ...existingSession, isGridMode: true };

	return {
		...data,
		meta: {
			...data.meta,
			fileType: 'inkDrawing',
		},
		tldraw: {
			...data.tldraw,
			document: {
				...data.tldraw.document,
				store: updatedStore,
			},
			session: sessionWithGridOn,
		},
	};
}

/**
 * Vault-IO wrapper: reads an inkWriting SVG file, converts it to inkDrawing,
 * and writes it back to the same path. File extension stays .svg.
 */
export const convertWriteFileToDraw = async (plugin: InkPlugin, file: TFile): Promise<void> => {
	if (file.extension !== 'svg') return;
	const v = plugin.app.vault;

	const svgStr = await v.read(file);
	const data = extractInkJsonFromSvg(svgStr);
	if (!data) return;
	if (data.meta.fileType !== 'inkWriting') return;

	const converted = isInkCanvasFile(data)
		? convertWriteInkCanvasDataToDraw(data)
		: convertWriteDataToDraw(data);
	const newSvgStr = isInkCanvasFile(data)
		? buildFileStr(converted)
		: buildFileStr({ ...converted, svgString: svgStr });
	await v.modify(file, newSvgStr);
};
