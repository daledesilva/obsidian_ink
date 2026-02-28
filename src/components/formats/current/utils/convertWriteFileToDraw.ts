import { TFile } from "obsidian";
import { TLShapeId } from "@tldraw/tldraw";
import InkPlugin from "src/main";
import { InkFileData } from "../types/file-data";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { buildFileStr } from "./buildFileStr";
import { WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from "src/constants";

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

	const converted = convertWriteDataToDraw(data);
	const newSvgStr = buildFileStr({ ...converted, svgString: data.svgString });
	await v.modify(file, newSvgStr);
};
