import { TextFileView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import InkPlugin from "src/main";
import { InkFileData } from "src/logic/utils/page-file";
import { InkFileType } from "src/components/formats/current/types/file-data";
import { TldrawWritingEditor } from "../tldraw-writing-editor/tldraw-writing-editor";
import { buildFileStr } from "../../utils/buildFileStr";
import { prepareDrawingSnapshot, prepareWritingSnapshot } from "src/logic/utils/tldraw-helpers";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";

////////
////////

export const WRITING_VIEW_TYPE = "ink_writing-view";

////////

export function registerWritingView (plugin: InkPlugin) {
    plugin.registerView(
        WRITING_VIEW_TYPE,
        (leaf) => new WritingView(leaf, plugin)
    );

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
                if (!svgString || !svgString.trim().startsWith('<svg')) return;

                const inkData = extractInkJsonFromSvg(svgString) as unknown as InkFileData | null;
                const fileType = (inkData as any)?.meta?.fileType as InkFileType | undefined;
                if (!inkData || fileType !== InkFileType.Writing) return;

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
        
        const pageData = extractInkJsonFromSvg(fileContents);
        if(pageData) {
            this.pageData = pageData;
        }

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
        return buildFileStr(this.pageData);
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











