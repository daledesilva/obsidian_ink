import { TFile } from "obsidian";
import { getGlobals } from "src/stores/global-store";
import { InkFileData } from "../types/file-data";

/////////
/////////

export async function getInkFileData(file: TFile): Promise<InkFileData> {
	const v = getGlobals().plugin.app.vault;
	const inkFileDataStr = await v.read(file);
	let inkFileData: InkFileData;
	try {
		inkFileData = JSON.parse(inkFileDataStr) as InkFileData;
	} catch (error) {
		console.error('解析文件数据失败:', error);
		throw new Error(`无法解析文件数据: ${file.path}`);
	}
	return inkFileData;
}
