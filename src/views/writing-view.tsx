import { SerializedStore, TLRecord, TLUiOverrides, Editor } from "@tldraw/tldraw";
import { Menu, TFile, TextFileView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { WRITE_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { TldrawWritingEditor } from "src/tldraw/writing/tldraw-writing-editor";
import { convertWriteFileToDraw } from "src/utils/convertWriteFileToDraw";
import { openInkFile } from "src/utils/open-file";
import { InkFileData, stringifyPageData } from "src/utils/page-file";

////////
////////

export const WRITING_VIEW_TYPE = "ink_writing-view";

////////

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
    pageData: InkFileData;
    tldrawControls: {
        resize?: Function,
    } = {}

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return WRITING_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Handwritten note";
    }
    
    // This provides the data from the file for placing into the view (Called by Obsidian when file is opening)
    setViewData = (fileContents: string, clear: boolean) => {
        if(!this.file) return;
        
        const pageData = JSON.parse(fileContents) as InkFileData;
        this.pageData = pageData;

        const viewContent = this.containerEl.children[1];
        viewContent.setAttr('style', 'padding: 0;');
		
        // If a new file is opening in the same leaf, then clear the old one instead of creating a new one
        if(this.root) this.clear();
        
        this.root = createRoot(viewContent);
		this.root.render(
            <TldrawWritingEditor
                plugin = {this.plugin}
                writingFile = {this.file}
                save = {this.saveFile}
                saveControlsReference = {(controls: any) => {
                    this.tldrawControls.resize = controls.resize;
                }}
			/>
        );
    }

    saveFile = (pageData: InkFileData) => {
        this.pageData = pageData;
        this.save(false);   // Obsidian will call getViewData during this method
    }
    
    // This allows you to return the data you want Obsidian to save (Called by Obsidian when file is closing)
    getViewData = (): string => {
        return stringifyPageData(this.pageData);
    }

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that, old files can save data over new files)
        this.root?.unmount();
    }

    onResize = () => {
        // TODO: Currently this doesn't refresh the width stored in the camera limits, so removed it for now
        // if(this.tldrawControls.resize) this.tldrawControls.resize();
    }

    // TODO: Consider converting between drawings and writing files in future

    // onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string): void {
    //     menu.addItem((item) => {
    //         item.setTitle('Convert to Drawing');
    //         item.setSection('action');
    //         item.onClick( async () => {
    //             if(!this.file) return;
    //             await convertWriteFileToDraw(this.plugin, this.file);
    //             openInkFile(this.plugin, this.file);
    //         })
    //     })
    //     super.onPaneMenu(menu, source);
    // }

}











