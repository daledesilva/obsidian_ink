import { TextFileView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import InkPlugin from "src/main";
import { InkFileData } from "src/components/formats/current/types/file-data";
import { TldrawWritingEditor } from "../tldraw-writing-editor/tldraw-writing-editor";
import { buildFileStr } from "../../utils/buildFileStr";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { WritingEditorControls } from "../writing-embed/writing-embed";

////////
////////

export const WRITING_VIEW_TYPE = "ink_writing-view";

////////

export function registerWritingView (plugin: InkPlugin) {
    // 防止重复注册相同的视图类型
    try {
        plugin.registerView(
            WRITING_VIEW_TYPE,
            (leaf) => new WritingView(leaf, plugin)
        );
    } catch (error) {
        if (error instanceof Error && error.message.includes('existing view type')) {
            console.warn(`View type ${WRITING_VIEW_TYPE} is already registered, skipping duplicate registration`);
            return;
        }
        throw error;
    }

    // Intercept .svg opens and switch to writing view when metadata indicates a writing file
    plugin.registerEvent(
        plugin.app.workspace.on('file-open', async (file) => {
            try {
                if (!file || file.extension !== 'svg') return;

                // Avoid re-entrancy if we're already in the writing view
                const activeLeaf = plugin.app.workspace.activeLeaf;
                if (!activeLeaf) return;
                const currentViewType = (activeLeaf as any).view?.getViewType?.();
                if (currentViewType === WRITING_VIEW_TYPE) return;

                const svgString = await plugin.app.vault.read(file);
                if (!svgString) return;
                
                // 检查SVG内容是否包含ink metadata，即使有XML和DOCTYPE声明也要识别
                const inkFileData = extractInkJsonFromSvg(svgString);
                if (!inkFileData) return;
                if (inkFileData.meta.fileType !== "inkWriting") return;

                await activeLeaf.setViewState({
                    type: WRITING_VIEW_TYPE,
                    state: { file: file.path },
                    active: true,
                });
            } catch (_) {
                // Fail silently; fall back to default SVG handling
            }
        })
    );
}

export class WritingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    inkFileData: InkFileData;
    editorControls: WritingEditorControls | null = null;
    tldrawControls: {
        resize?: Function,
    } = {}
    hostEl: HTMLElement | null;

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.hostEl = null;
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
        host.className = 'ink-writing-view-host';
        host.style.height = '100%';
        viewContent.appendChild(host);
        this.hostEl = host;

        this.root = createRoot(host);
		this.root.render(
            <TldrawWritingEditor
                plugin = {this.plugin}
                writingFile = {this.file}
                save = {this.saveFile}
                saveControlsReference = {this.registerEditorControls}
			/>
        );
    }

    saveFile = (inkFileData: InkFileData) => {
        this.inkFileData = inkFileData;
        this.save(false);   // Obsidian will call getViewData during this method
    }

    // Register editor controls for saving before unmount
    registerEditorControls = (controls: WritingEditorControls) => {
        this.editorControls = controls;
        // Also store resize for backward compatibility
        this.tldrawControls.resize = (controls as any).resize;
    }
    
    // This allows you to return the data you want Obsidian to save (Called by Obsidian when file is closing)
    getViewData = (): string => {
        return buildFileStr(this.inkFileData);
    }

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // Clear editor controls reference
        this.editorControls = null;
        
        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that, old files can save data over new files)
        try {
            if(this.root) this.root.unmount();
        } catch (_) {}
        this.root = null;
        if(this.hostEl && this.hostEl.isConnected) {
            try { this.hostEl.remove(); } catch (_) {}
        }
        this.hostEl = null;
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


    async onClose(): Promise<void> {
        // Save current state before unmounting to prevent empty SVG
        if (this.editorControls) {
            await this.editorControls.saveAndHalt();
        }
        
        // Then cleanup
        this.clear();
        return await super.onClose();
    }
}











