import InkPlugin from "src/main";
import { Editor, Notice } from "obsidian";
import { buildWritingEmbed } from "src/utils/embed";
import { fetchLocally } from "src/utils/storage";

//////////
//////////

const insertRecentlyDuplicatedWritingFile = async (plugin: InkPlugin, editor: Editor) => {
    const recentFilepath = fetchLocally('lastWritingDuplicate');
    if(!recentFilepath) {
        new Notice('No recently duplicated file');
        return;
    }

    let embedStr = buildWritingEmbed(recentFilepath);
    editor.replaceRange( embedStr, editor.getCursor() );
}

export default insertRecentlyDuplicatedWritingFile;