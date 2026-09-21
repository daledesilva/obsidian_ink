import { TFile } from "obsidian";
import { InkFileData } from "../types/file-data";
import InkPlugin from "src/main";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { buildFileStr } from "./buildFileStr";
import { serializeBboxCellsAtLastTranscription } from "src/logic/stroke-bbox-cells";

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
 * Optionally stores bbox occupancy snapshot on `<ink>` after a successful apply.
 * Preserves the file mtime so transcript updates do not look like a content edit.
 */
export const saveWriteFileTranscript = async (
    plugin: InkPlugin,
    fileRef: TFile,
    transcript: string,
    transcriptionFingerprint?: { lastTranscriptionAt: string },
) => {
    const v = plugin.app.vault;
    const pageDataStr = await v.read(fileRef);
    const pageData = extractInkJsonFromSvg(pageDataStr);
    if (!pageData) return;

    pageData.meta.transcript = transcript;
    if (transcriptionFingerprint) {
        // Occupancy fingerprint only on successful apply — from stroke geometry now on disk.
        pageData.meta.bboxCellsAtLastTranscription = serializeBboxCellsAtLastTranscription(pageData);
        pageData.meta.lastTranscriptionAt = transcriptionFingerprint.lastTranscriptionAt;
    }
    const newPageDataStr = buildFileStr(pageData);

    await v.modify(fileRef, newPageDataStr, { mtime: fileRef.stat.mtime });
};
