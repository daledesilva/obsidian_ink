import { TextFileView, TFile, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { DRAW_FILE_V1_EXT } from "src/constants";
import InkPlugin from "src/main";
import { TldrawDrawingEditor_v1 } from "src/components/formats/v1-code-blocks/drawing/tldraw-drawing-editor/tldraw-drawing-editor";
import { 
	Provider as JotaiProvider
} from "jotai";
import { rememberDrawingFile } from "src/logic/utils/rememberDrawingFile";
import { buildFileStr_v1 } from "src/components/formats/v1-code-blocks/utils/buildFileStr";
import { InkFileData_v1 } from "../../types/file-data";

////////
////////

export const DRAWING_VIEW_V1_TYPE = "ink_drawing-v1-view";

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

export function registerDrawingView_v1 (plugin: InkPlugin) {
    // 检查是否已经注册了ink_drawing-v1-view视图类型
    try {
        plugin.registerView(
            DRAWING_VIEW_V1_TYPE,
            (leaf) => new DrawingView_v1(leaf, plugin)
        );
        plugin.registerExtensions([DRAW_FILE_V1_EXT], DRAWING_VIEW_V1_TYPE);
    } catch (error) {
        // 如果已经注册过，忽略"existing view type"错误
        if (error && typeof error === 'object' && 'message' in error && 
            typeof error.message === 'string' && error.message.includes('existing view type')) {
            console.log('View type ink_drawing-v1-view is already registered, skipping...');
        } else {
            // 重新抛出其他错误
            throw error;
        }
    }
}

export class DrawingView_v1 extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    pageData: InkFileData_v1;

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return DRAWING_VIEW_V1_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Drawing";
    }
    
    // This provides the data from the file for placing into the view (Called when file is opening)
    setViewData = (fileContents: string, clear: boolean) => {
        if(!this.file) return;
        
        const pageData = JSON.parse(fileContents) as InkFileData_v1;
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

    saveFile = (pageData: InkFileData_v1) => {
        this.pageData = pageData;
        this.save(false);   // Obsidian will call getViewData during this method
    }
    
    // This allows you to return the data you want Obsidian to save (Called by Obsidian when file is closing)
    getViewData = (): string => {
        return buildFileStr_v1(this.pageData);
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











