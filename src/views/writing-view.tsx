import { SerializedStore, TLRecord, TLUiOverrides, Editor } from "@tldraw/tldraw";
import { Menu, TFile, TextFileView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { WRITE_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import TldrawHandwrittenEditor from "src/tldraw/writing/tldraw-writing-editor";
import { convertWriteFileToDraw } from "src/utils/file-manipulation";
import { openInkFile } from "src/utils/open-file";
import { PageData, buildPageFile } from "src/utils/page-file";

////////
////////

export const WRITING_VIEW_TYPE = "ink_writing-view";
export enum ViewPosition {
    replacement,
    tab,
    verticalSplit,
    horizontalSplit
}



export function registerWritingView (plugin: InkPlugin) {
    plugin.registerView(
        WRITING_VIEW_TYPE,
        (leaf) => new WritingView(leaf, plugin)
    );
    plugin.registerExtensions([WRITE_FILE_EXT], WRITING_VIEW_TYPE);
}


export class WritingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    tldrawData: SerializedStore<TLRecord> = {};
    previewImageUri: string | null;

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    saveFile = (tldrawData: SerializedStore<TLRecord>, previewImageUri: string | null = null) => {
        this.tldrawData = tldrawData;
        this.previewImageUri = previewImageUri;
        this.save(false);   // this called getViewData
    }

    getViewType(): string {
        return WRITING_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Handwritten note";
    }
    
    // This provides the data from the file for placing into the view (Called when file is opening)
    setViewData = (fileContents: string, clear: boolean) => {
        if(!this.file) return;
        
        const pageData = JSON.parse(fileContents) as PageData;
        this.tldrawData = pageData.tldraw;

        const viewContent = this.containerEl.children[1];
        viewContent.setAttr('style', 'padding: 0;');
		
        // If a new handwriting file is opening in the same leaf, then clear the old one
        if(this.root) this.clear();
        
        this.root = createRoot(viewContent);
		this.root.render(
            <TldrawHandwrittenEditor
                plugin = {this.plugin}
                existingData = {this.tldrawData}
                filepath = {this.file.path}
                save = {this.saveFile}
			/>
        );
    }
    
    // This allows you to return the data you want obsidian to save (Called when file is closing)
    getViewData = (): string => {
        const fileContents = buildPageFile(this.tldrawData, this.previewImageUri);
        return fileContents;
    }

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that old files can save data into new ones)
        this.root?.unmount();
    }

    
    onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string): void {
        menu.addItem((item) => {
            item.setTitle('Convert to Drawing');
            item.setSection('action');
            item.onClick( async () => {
                if(!this.file) return;
                await convertWriteFileToDraw(this.plugin, this.file);
                openInkFile(this.plugin, this.file);
            })
        })
        super.onPaneMenu(menu, source);
    }

    // onResize()

}










