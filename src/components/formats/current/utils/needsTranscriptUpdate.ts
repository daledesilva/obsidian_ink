import { TFile } from "obsidian";
import { InkFileData } from "../types/file-data";
import InkPlugin from "src/main";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { buildFileStr } from "./buildFileStr";

////////
////////

export const needsTranscriptUpdate = (pageData: InkFileData): boolean => {
    // TODO: Also check if the transcript is older than the last file update
    // if(!pageData.meta.transcript) {
    // return true;
    // } else {
    return false;
    // }
};

/**
 * Writes a transcript onto current-format ink SVG metadata (`<transcript>…</transcript>`).
 * Optionally stores svgContentHash / svgContentHashedAt on `<ink>`.
 * Preserves the file mtime so transcript updates do not look like a content edit.
 */
export const saveWriteFileTranscript = async (
    plugin: InkPlugin,
    fileRef: TFile,
    transcript: string,
    hashFields?: { svgContentHash: string; svgContentHashedAt: string },
) => {
    const v = plugin.app.vault;
    const pageDataStr = await v.read(fileRef);
    const pageData = extractInkJsonFromSvg(pageDataStr);
    if (!pageData) return;

    pageData.meta.transcript = transcript;
    if (hashFields) {
        pageData.meta.svgContentHash = hashFields.svgContentHash;
        pageData.meta.svgContentHashedAt = hashFields.svgContentHashedAt;
    }
    const newPageDataStr = buildFileStr(pageData);

    await v.modify(fileRef, newPageDataStr, { mtime: fileRef.stat.mtime });
};
