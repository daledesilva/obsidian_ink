import InkPlugin from "src/main";
import { Editor, Notice } from "obsidian";
import { buildDrawingEmbed } from "src/utils/embed";
import createNewDrawingFile from "./create-new-drawing-file";
import { PLUGIN_KEY } from "src/constants";
import { fetchLocally } from "src/utils/storage";

//////////
//////////

const insertRecentlyDuplicatedDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
    const recentFilepath = fetchLocally('lastDrawingDuplicate');
    if(!recentFilepath) {
        new Notice('No recently duplicated file');
        return;
    }

    let embedStr = buildDrawingEmbed(recentFilepath);
    editor.replaceRange( embedStr, editor.getCursor() );
}

//////////

export default insertRecentlyDuplicatedDrawingFile;