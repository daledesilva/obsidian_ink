import { App, Editor, FuzzySuggestModal, Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";

/////////
/////////

// TODO: This file isn't yet implemented

export const insertExistingDrawingFile = async (plugin: InkPlugin, editor: Editor) => {
    // Build a list of valid drawing SVGs before opening the modal
    const allFiles = plugin.app.vault.getFiles();
    const svgFiles = allFiles.filter(f => f.extension === 'svg');
    const validFiles: TFile[] = [];

    for (let i = 0; i < svgFiles.length; i++) {
        const file = svgFiles[i];
        try {
            const svgString = await plugin.app.vault.read(file);
            if (!svgString || !svgString.trim().startsWith('<svg')) continue;
            const inkData = extractInkJsonFromSvg(svgString);
            const fileType = (inkData as any)?.meta?.fileType;
            if (inkData && fileType === 'drawing') validFiles.push(file);
        } catch (_) {
            // ignore invalid/unreadable files
        }
    }

    if (validFiles.length === 0) {
        new Notice('No drawing SVGs found');
        return;
    }

    new SelectHandwritingFileModal(plugin.app, validFiles, (filepath) => {
        let embedStr = buildDrawingEmbed(filepath);
        editor.replaceRange( embedStr, editor.getCursor() );
    }).open();
}

export class SelectHandwritingFileModal extends FuzzySuggestModal<TFile> {
    onSubmit: Function;
    files: TFile[];

    constructor(app: App, files: TFile[], onSubmit: (filepath: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.files = files;
    }

    getItems(): TFile[] {
        // Only show pre-validated drawing SVG files
        return this.files;
    }

    getItemText(file: TFile): string {
        return file.basename;
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
        this.onSubmit(file.path);
    }
}
