import { TFile } from "obsidian";
import { getGlobals } from "src/stores/global-store";
import { InkFileData_v1 } from "src/components/formats/v1-code-blocks/types/file-data";

/////////
/////////

export async function getInkFileData(file: TFile): Promise<InkFileData_v1> {
	const v = getGlobals().plugin.app.vault;
	const inkFileDataStr = await v.read(file);
	const inkFileData = JSON.parse(inkFileDataStr) as InkFileData_v1;
	return inkFileData;
}
