import { TFile } from "obsidian";
import { getGlobals } from "src/stores/global-store";
import { InkFileData } from "../types/file-data";

/////////
/////////

export async function getInkFileData(file: TFile): Promise<InkFileData> {
	const v = getGlobals().plugin.app.vault;
	const inkFileDataStr = await v.read(file);
	const inkFileData = JSON.parse(inkFileDataStr) as InkFileData;
	return inkFileData;
}
