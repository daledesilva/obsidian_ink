import { App, Editor, FuzzySuggestModal, Notice, TFile } from "obsidian";
import { WRITE_FILE_V1_EXT } from "src/constants";
import InkPlugin from "src/main";
import { buildWritingEmbed_v1 } from "src/components/formats/v1-code-blocks/utils/build-embeds";

////////
////////

export const insertExistingWritingFile_v1 = (plugin: InkPlugin, editor: Editor) => {
    new SelectHandwritingFileModal_v1(plugin.app, (filepath) => {
        let embedStr = buildWritingEmbed_v1(filepath);
        editor.replaceRange( embedStr, editor.getCursor() );
    }).open();
    
}

export class SelectHandwritingFileModal_v1 extends FuzzySuggestModal<TFile> {
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
            if(file.extension === WRITE_FILE_V1_EXT) files.push(file);
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