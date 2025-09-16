import { TFile } from "obsidian"
import InkPlugin from "src/main"
import { InkFileData } from "../types/file-data";
import { needsTranscriptUpdate, saveWriteFileTranscript } from "src/components/formats/v1-code-blocks/utils/needsTranscriptUpdate";
import { fetchWriteFileTranscript } from "src/logic/ocr-service";

//////////
//////////

export const fetchTranscriptIfNeeded = (plugin: InkPlugin, fileRef: TFile, pageData: InkFileData): void => {
	if(needsTranscriptUpdate(pageData)) {
		fetchWriteFileTranscript()
			.then((transcript) => {
				saveWriteFileTranscript(plugin, fileRef, transcript)
			})
	}
}