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
import { addEditButtonToSvgView } from "src/logic/utils/addEditButtonToSvgView";
import { TldrawDrawingEditor } from "../tldraw-drawing-editor/tldraw-drawing-editor";
import { InkFileData } from "../../types/file-data";
import { DrawingEditorControls } from "../drawing-embed/drawing-embed";

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

    // Helper function to check and add edit button for drawing files
    async function checkAndAddEditButton(leaf: any, file: any) {
        if (!file || file.extension !== 'svg') return;
        if (!leaf) return;
        
        const currentViewType = leaf.view?.getViewType?.();
        // Skip if already in our custom view
        if (currentViewType === DRAWING_VIEW_TYPE) return;

        try {
            const svgString = await plugin.app.vault.read(file);
            if (!svgString || !svgString.trim().startsWith('<svg')) return;

            const inkFileData = extractInkJsonFromSvg(svgString);
            if (!inkFileData) return;
            if (inkFileData.meta.fileType !== "inkDrawing") return;

            // Add edit button to the SVG view
            addEditButtonToSvgView(plugin, leaf, file, DRAWING_VIEW_TYPE);
        } catch (_) {
            // Fail silently; fall back to default SVG handling
        }
    }

    // Add edit button to SVG views that contain ink drawing data
    plugin.registerEvent(
        plugin.app.workspace.on('file-open', async (file) => {
            const activeLeaf = plugin.app.workspace.activeLeaf;
            if (activeLeaf) {
                await checkAndAddEditButton(activeLeaf, file);
            }
        })
    );

    // Also check when a leaf becomes active (e.g., when navigating back)
    plugin.registerEvent(
        plugin.app.workspace.on('active-leaf-change', async (leaf) => {
            if (leaf?.view?.file) {
                await checkAndAddEditButton(leaf, leaf.view.file);
            }
        })
    );
}

export class DrawingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    inkFileData: InkFileData;
    hostEl: HTMLElement | null;
    editorControls: DrawingEditorControls | null = null; // Add this

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.hostEl = null;
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

        const viewContent = this.containerEl.children[1] as HTMLElement;
        viewContent.setAttr('style', 'padding: 0;');
		
        // If a new file is opening in the same leaf, then clear the old one instead of creating a new one
        if(this.root) this.clear();

        // Create a dedicated host for React to avoid conflicts with Obsidian lifecycle
        const host = viewContent.ownerDocument.createElement('div');
        host.className = 'ink-drawing-view-host';
        host.style.height = '100%';
        viewContent.appendChild(host);
        this.hostEl = host;

        this.root = createRoot(host);
		this.root.render(
            <JotaiProvider>
                <TldrawDrawingEditor
                    onReady = {() => {}}
                    drawingFile = {this.file}
                    save = {this.saveFile}
                    extendedMenu = {getExtendedOptions(this.plugin, this.file)}
                    saveControlsReference = {this.registerEditorControls} // Add this
                />
            </JotaiProvider>
        );
    }

    saveFile = (inkFileData: InkFileData) => {
        this.inkFileData = inkFileData;
        this.save(false);   // Obsidian will call getViewData during this method
    }
    
    // This allows you to return the data you want Obsidian to save (Called by Obsidian when file is closing)
    getViewData = (): string => {
        return buildFileStr(this.inkFileData);
    }

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // Clear editor controls reference
        this.editorControls = null;

        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that, old files can save data into new ones)
        try {
            if(this.root) this.root.unmount();
        } catch (_) {}
        this.root = null;
        if(this.hostEl && this.hostEl.isConnected) {
            try { this.hostEl.remove(); } catch (_) {}
        }
        this.hostEl = null;
    }

    // Add method to register editor controls
    registerEditorControls = (controls: DrawingEditorControls) => {
        this.editorControls = controls;
    }

    async onClose(): Promise<void> {
        // Save current state before unmounting
        if (this.root && this.editorControls) {
            await this.editorControls.saveAndHalt();
        }
        
        // Then cleanup
        this.clear();
        return await super.onClose();
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











