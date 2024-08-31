import { TFile } from "obsidian"
import InkPlugin from "src/main"
import { InkFileData } from "./page-file"
import { needsTranscriptUpdate, saveWriteFileTranscript } from "src/utils/needsTranscriptUpdate";
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