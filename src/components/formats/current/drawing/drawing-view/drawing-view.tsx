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
import { buildFileStr } from "../../utils/buildFileStr";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { TldrawDrawingEditor } from "../tldraw-drawing-editor/tldraw-drawing-editor";
import { InkFileData } from "../../types/file-data";

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

    // Intercept .svg opens and switch to drawing view when metadata indicates a drawing file
    plugin.registerEvent(
        plugin.app.workspace.on('file-open', async (file) => {
            try {
                if (!file || file.extension !== 'svg') return;

                // Avoid re-entrancy if we're already in the drawing view
                const activeLeaf = plugin.app.workspace.activeLeaf;
                if (!activeLeaf) return;
                const currentViewType = (activeLeaf as any).view?.getViewType?.();
                if (currentViewType === DRAWING_VIEW_TYPE) return;

                const svgString = await plugin.app.vault.read(file);
                if (!svgString || !svgString.trim().startsWith('<svg')) return;

                const inkFileData = extractInkJsonFromSvg(svgString);
                if (!inkFileData) return;
                if (inkFileData.meta.fileType !== "inkDrawing") return;

                await activeLeaf.setViewState({
                    type: DRAWING_VIEW_TYPE,
                    state: { file: file.path },
                    active: true,
                });
            } catch (_) {
                // Fail silently; fall back to default SVG handling
            }
        })
    );
}

export class DrawingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    inkFileData: InkFileData;

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
        
        const inkFileData = extractInkJsonFromSvg(fileContents);
        if(inkFileData) {
            this.inkFileData = inkFileData;
        }

        const viewContent = this.containerEl.children[1];
        viewContent.setAttr('style', 'padding: 0;');
		
        // If a new file is opening in the same leaf, then clear the old one instead of creating a new one
        if(this.root) this.clear();
        
        this.root = createRoot(viewContent);
		this.root.render(
            <JotaiProvider>
                <TldrawDrawingEditor
                    onReady = {() => {}}
                    drawingFile = {this.file}
                    save = {this.saveFile}
                    extendedMenu = {getExtendedOptions(this.plugin, this.file)}
                />
            </JotaiProvider>
        );
    }

    saveFile = (pageData: InkFileData) => {
        this.inkFileData = pageData;
        this.save(false);   // Obsidian will call getViewData during this method
    }
    
    // This allows you to return the data you want Obsidian to save (Called by Obsidian when file is closing)
    getViewData = (): string => {
        return buildFileStr(this.inkFileData);
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











