import { App, Editor, FuzzySuggestModal, Notice, TFile } from "obsidian";
import { WRITE_FILE_EXT } from "src/constants";
import HandwritePlugin from "src/main";
import { buildEmbed } from "src/utils/embed";



export const insertExistingInkNote = (plugin: HandwritePlugin, editor: Editor) => {
    // const fileRef = await createNewHandwrittenNote(plugin);
    new SelectHandwritingFileModal(plugin.app, (filepath) => {
        let embedStr = buildEmbed(filepath);
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
        const handwrittenFiles: TFile[] = [];
        for(let i=0; i<allFiles.length; i++) {
            const file = allFiles[i];
            if(file.extension === WRITE_FILE_EXT) handwrittenFiles.push(file);
        }
        return handwrittenFiles;
    }

    getItemText(file: TFile): string {
        return file.basename;
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
        this.onSubmit(file.path);
    }
}


export default insertExistingInkNote;