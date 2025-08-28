import { TFile } from "obsidian";
import { WRITE_FILE_V1_EXT } from "src/constants";
import InkPlugin from "src/main";
import { InkFileData } from "./page-file";

////////
////////

export const needsTranscriptUpdate = (pageData: InkFileData): boolean => {
    // TODO: Also check if hte transcript is older than the last file update
    // if(!pageData.meta.transcript) {
    // return true;
    // } else {
    return false;
    // }
};

export const saveWriteFileTranscript = async (plugin: InkPlugin, fileRef: TFile, transcript: string) => {
    if (fileRef.extension !== WRITE_FILE_V1_EXT) return;
    const v = plugin.app.vault;

    // console.log('saving transcript to', fileRef.path);
    const pageDataStr = await v.read(fileRef as TFile);
    const pageData = JSON.parse(pageDataStr) as InkFileData;

    // TODO: Add in a date of the transcript
    pageData.meta.transcript = "The new transcript";
    const newPageDataStr = JSON.stringify(pageData, null, '\t');

    await v.modify(fileRef, newPageDataStr, { mtime: fileRef.stat.mtime });
};
