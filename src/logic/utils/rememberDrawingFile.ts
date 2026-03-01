import { Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { saveLocally } from "./storage";
import { getGlobals } from "src/stores/global-store";
import { buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { buildWritingEmbed } from "src/components/formats/current/utils/build-embeds";

////////////////////////
////////////////////////

export const rememberDrawingFile = async (existingFileRef: TFile) => {
    if (!(existingFileRef instanceof TFile)) {
        new Notice('No file found to copy');
        return;
    }

    saveLocally('rememberedDrawingFile', existingFileRef.path);

    const embedStr = buildDrawingEmbed(existingFileRef.path);
    await navigator.clipboard.writeText(embedStr.replace(/^\n+|\n+$/g, '') + '\n\n');

    new Notice(`Drawing embed copied.\nPaste where desired in a note.`);
};

export const rememberWritingFile = async (plugin: InkPlugin, existingFileRef: TFile) => {
    if (!(existingFileRef instanceof TFile)) {
        new Notice('No file found to copy');
        return null;
    }

    saveLocally('rememberedWritingFile', existingFileRef.path);

    const embedStr = buildWritingEmbed(existingFileRef.path);
    await navigator.clipboard.writeText(embedStr.replace(/^\n+|\n+$/g, '') + '\n\n');

    new Notice(`Writing embed copied.\nPaste where desired in a note.`);
};


