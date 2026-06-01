import InkPlugin from "src/main";
import { buildInkCanvasDrawingFileData } from "src/components/formats/current/utils/build-file-data";
import { getNewTimestampedDrawingSvgFilepath } from "src/logic/utils/file-manipulation";
import { createFoldersForFilepath } from "src/logic/utils/createFoldersForFilepath";
import { TFile } from "obsidian";
import { buildFileStr } from "src/components/formats/current/utils/buildFileStr";
import emptyDrawingSvgStr from "src/defaults/empty-drawing-embed.svg";
import type { InkCanvasSnapshot } from "src/ink-canvas/types";

////////
////////

export const createNewDrawingFile = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedDrawingSvgFilepath(plugin, instigatingFile);
    const inkCanvasSnapshot: InkCanvasSnapshot = {
        version: 1,
        strokes: [],
        gridEnabled: false,
    };
    const pageData = buildInkCanvasDrawingFileData({
        inkCanvasSnapshot,
        svgString: emptyDrawingSvgStr,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, buildFileStr(pageData));
    return fileRef;
}
