import { TFile } from "obsidian";
import { getGlobals } from "src/stores/global-store";
import { DRAW_FILE_V1_EXT } from "src/constants";

////////////////////////
////////////////////////

export async function getInkFileFromPreview(previewFilepath: string): Promise<TFile | null> {
	const v = getGlobals().plugin.app.vault;
	const previewFile = v.getAbstractFileByPath(previewFilepath);
	if(!previewFile) return null; // TODO: Handle this non-silently

	let filepathArr = previewFilepath.split('.');
	filepathArr.pop();
	filepathArr.push(`.${DRAW_FILE_V1_EXT}`);
	const inkFilepath = filepathArr.join('.');
	const inkFile = v.getAbstractFileByPath(inkFilepath);
	if(!inkFile) return null; // TODO: Handle this non-silently

	return inkFile as TFile;
}