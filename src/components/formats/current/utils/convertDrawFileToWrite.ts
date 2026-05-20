import { TFile } from "obsidian";
import { TLShapeId } from "@tldraw/tldraw";
import InkPlugin from "src/main";
import { InkFileData } from "../types/file-data";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { buildFileStr } from "./buildFileStr";
import { WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from "src/constants";

function inferTldrawPageId(store: InkFileData['tldraw']['document']['store']): string {
	for (const value of Object.values(store)) {
		if (typeof value !== 'object' || value === null) continue;
		const record = value as unknown as Record<string, unknown>;
		if (record.typeName === 'page' && typeof record.id === 'string') {
			return record.id;
		}
	}
	return 'page:page';
}

////////
////////

/**
 * Pure data transformation: converts an inkDrawing InkFileData to inkWriting.
 * Adds writing-container and writing-lines shapes to the tldraw store
 * and updates the fileType metadata.
 */
export function convertDrawDataToWrite(data: InkFileData): InkFileData {
	const store = data.tldraw.document.store;

	const pageId = inferTldrawPageId(store);

	const writingContainerShape = {
		x: 0,
		y: 0,
		rotation: 0,
		isLocked: true,
		opacity: 1,
		meta: {},
		type: 'writing-container',
		parentId: pageId,
		index: 'a0',
		props: {
			x: 0,
			y: 0,
			w: WRITING_PAGE_WIDTH,
			h: WRITING_MIN_PAGE_HEIGHT,
		},
		id: 'shape:writing-container',
		typeName: 'shape',
	};

	const writingLinesShape = {
		x: 0,
		y: 0,
		rotation: 0,
		isLocked: true,
		opacity: 1,
		meta: {},
		type: 'writing-lines',
		parentId: pageId,
		index: 'a0',
		props: {
			x: 0,
			y: 0,
			w: WRITING_PAGE_WIDTH,
			h: WRITING_MIN_PAGE_HEIGHT,
		},
		id: 'shape:writing-lines',
		typeName: 'shape',
	};

	const updatedStore = {
		...store,
		['shape:writing-container' as TLShapeId]: writingContainerShape,
		['shape:writing-lines' as TLShapeId]: writingLinesShape,
	};

	const existingSession = data.tldraw.session ?? {};
	const sessionWithGridOff = { ...existingSession, isGridMode: false };

	return {
		...data,
		meta: {
			...data.meta,
			fileType: 'inkWriting',
		},
		tldraw: {
			...data.tldraw,
			document: {
				...data.tldraw.document,
				store: updatedStore,
			},
			session: sessionWithGridOff,
		},
	};
}

/**
 * Vault-IO wrapper: reads an inkDrawing SVG file, converts it to inkWriting,
 * and writes it back to the same path. File extension stays .svg.
 */
export const convertDrawFileToWrite = async (plugin: InkPlugin, file: TFile): Promise<void> => {
	if (file.extension !== 'svg') return;
	const v = plugin.app.vault;

	const svgStr = await v.read(file);
	const data = extractInkJsonFromSvg(svgStr);
	if (!data) return;
	if (data.meta.fileType !== 'inkDrawing') return;

	const converted = convertDrawDataToWrite(data);
	const newSvgStr = buildFileStr({ ...converted, svgString: svgStr });
	await v.modify(file, newSvgStr);
};
