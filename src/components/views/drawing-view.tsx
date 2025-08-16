import { TextFileView, TFile, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { DRAW_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { TldrawDrawingEditor_v1 } from "src/components/formats/v1-code-blocks/drawing/tldraw-drawing-editor/tldraw-drawing-editor";
import { InkFileData } from "src/logic/utils/page-file";
import { 
	Provider as JotaiProvider
} from "jotai";
import { rememberDrawingFile } from "src/logic/utils/rememberDrawingFile";
import { buildFileStr } from "src/logic/utils/buildFileStr";

////////
////////

export const DRAWING_VIEW_TYPE = "ink_drawing-view";

function getExtendedOptions(plugin: InkPlugin, fileRef: TFile) {
    return [
        {
            text: 'Copy drawing',
            action: async () => {
                await rememberDrawingFile(fileRef);
            }
        },
    ]
}

////////

export function registerDrawingView (plugin: InkPlugin) {
    plugin.registerView(
        DRAWING_VIEW_TYPE,
        (leaf) => new DrawingView(leaf, plugin)
    );
    plugin.registerExtensions([DRAW_FILE_EXT], DRAWING_VIEW_TYPE);
}

export class DrawingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    pageData: InkFileData;

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return DRAWING_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Drawing";
    }
    
    // This provides the data from the file for placing into the view (Called when file is opening)
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
            <JotaiProvider>
                <TldrawDrawingEditor_v1
                    plugin={this.plugin}
                    onReady = {() => {}}
                    drawingFile = {this.file}
                    save = {this.saveFile}
                    extendedMenu = {getExtendedOptions(this.plugin, this.file)}
                />
            </JotaiProvider>
        );
    }

    saveFile = (pageData: InkFileData) => {
        this.pageData = pageData;
        this.save(false);   // Obsidian will call getViewData during this method
    }
    
    // This allows you to return the data you want Obsidian to save (Called by Obsidian when file is closing)
    getViewData = (): string => {
        return buildFileStr(this.pageData);
    }

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that, old files can save data into new ones)
        this.root?.unmount();
    }

    // onResize()

    // TODO: Consider converting between drawings and writing files in future
    
    // onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string): void {
    //     menu.addItem((item) => {
    //         item.setTitle('Convert to Write file');
    //         item.setSection('action');
    //         item.onClick( () => {
    //             console.log('clicked');
    //         })
    //     })
    //     super.onPaneMenu(menu, source);
    // }

}











