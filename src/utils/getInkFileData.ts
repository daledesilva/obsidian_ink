import { TFile } from "obsidian";
import InkPlugin from "src/main";
import { InkFileData } from "./page-file";

/////////
/////////

export async function getInkFileData(plugin: InkPlugin, file: TFile): Promise<InkFileData> {
	const v = plugin.app.vault;
	const inkFileDataStr = await v.read(file);
	const inkFileData = JSON.parse(inkFileDataStr) as InkFileData;
	return inkFileData;
}
