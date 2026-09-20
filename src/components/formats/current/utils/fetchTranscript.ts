import { TFile } from "obsidian"
import InkPlugin from "src/main"
import { InkFileData } from "../types/file-data";
import { needsTranscriptUpdate, saveWriteFileTranscript } from "./needsTranscriptUpdate";
import { transcribeWriting } from "src/logic/transcribe-writing";

//////////
//////////

/** Dormant until needsTranscriptUpdate enables auto-transcribe; manual flow uses the editor overflow menu. */
export const fetchTranscriptIfNeeded = (plugin: InkPlugin, fileRef: TFile, pageData: InkFileData): void => {
	if(needsTranscriptUpdate(pageData)) {
		void plugin.app.vault.read(fileRef)
			.then((writingSvgFileContent) => transcribeWriting(writingSvgFileContent))
			.then((transcript) => {
				void saveWriteFileTranscript(plugin, fileRef, transcript);
			})
	}
}
