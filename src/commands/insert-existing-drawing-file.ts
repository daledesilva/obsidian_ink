import { App, Editor, FuzzySuggestModal, TFile } from "obsidian";
import { DRAW_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";

/////////
/////////

export const insertExistingDrawingFile = (plugin: InkPlugin, editor: Editor) => {
    // const fileRef = await createNewHandwrittenNote(plugin);
    new SelectHandwritingFileModal(plugin.app, (filepath) => {
        let embedStr = buildDrawingEmbed(filepath);
        editor.replaceRange( embedStr, editor.getCursor() );
    }).open();
    
}

export class SelectHandwritingFileModal extends FuzzySuggestModal<TFile> {
    onSubmit: Function;

    constructor(app: App, onSubmit: (filepath: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    getItems(): TFile[] {
        const allFiles = this.app.vault.getFiles();
        const files: TFile[] = [];
        for(let i=0; i<allFiles.length; i++) {
            const file = allFiles[i];
            if(file.extension === DRAW_FILE_EXT) files.push(file);
        }
        return files;
    }

    getItemText(file: TFile): string {
        return file.basename;
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
        this.onSubmit(file.path);
    }
}
