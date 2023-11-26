import { SerializedStore, TLRecord } from "@tldraw/tldraw";
import { TFile, TextFileView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import HandwritePlugin from "src/main";
import TldrawViewEditor from 'src/tldraw/tldraw-view-editor';
import { PageData, buildPageFile } from "src/utils/page-file";

////////
////////

export const HANDWRITING_VIEW_TYPE = "handwriting-view";
export enum ViewPosition {
    replacement,
    tab,
    verticalSplit,
    horizontalSplit
}



export function registerHandwritingView (plugin: HandwritePlugin) {
    plugin.registerView(
        HANDWRITING_VIEW_TYPE,
        (leaf) => new HandwritingView(leaf, this)
    );
    plugin.registerExtensions(['writing'], HANDWRITING_VIEW_TYPE);
}


export class HandwritingView extends TextFileView {
    root: null | Root;
    plugin: HandwritePlugin;
    liveTldrawData: SerializedStore<TLRecord> = {};

    constructor(leaf: WorkspaceLeaf, plugin: HandwritePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    buildPageAndSave = (tldrawData: SerializedStore<TLRecord>) => {
        this.liveTldrawData = tldrawData;
        this.requestSave();
    }

    getViewType(): string {
        return HANDWRITING_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Handwritten note";
    }
    
    // This provides the data from the file for placing into the view (Called when file is opening)
    setViewData = (fileContents: string, clear: boolean) => {
        if(!this.file) return;
        
        const pageData = JSON.parse(fileContents) as PageData;
        this.liveTldrawData = pageData.tldraw;

        const viewContent = this.containerEl.children[1];
        viewContent.setAttr('style', 'padding: 0;');
		
        // If a new handwriting file is opening in the same leaf, then clear the old one
        if(this.root) this.clear();
        
        this.root = createRoot(viewContent);
		this.root.render(
            <TldrawViewEditor
                existingData = {this.liveTldrawData}
                uid = {this.file.path}
                save = {this.buildPageAndSave}
			/>
        );
    }
    
    // This allows you to return the data you want obsidian to save (Called when file is closing)
    getViewData = (): string => {
        const fileContents = buildPageFile(this.liveTldrawData);
        return fileContents;
    }

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that old files can save data into new ones)
        this.root?.unmount();
    }

    
    // onPaneMenu()

    // onResize()

}











export async function openInkFile(plugin: HandwritePlugin, fileRef: TFile, position: ViewPosition = ViewPosition.replacement) {
    switch(position) {
        case ViewPosition.replacement:      activateReplacementView(plugin, fileRef); break;
        case ViewPosition.tab:              activateTabView(plugin, fileRef); break;
        case ViewPosition.verticalSplit:    activateSplitView(plugin, fileRef, 'horizontal'); break;
        case ViewPosition.horizontalSplit:  activateSplitView(plugin, fileRef, 'vertical'); break;
        default: activateReplacementView(plugin, fileRef); break;
    }
}




// Old, probably not necessary


// export async function activateHandwritingView(plugin: HandwritePlugin, position: ViewPosition = ViewPosition.replacement) {
// 	switch(position) {
//         case ViewPosition.replacement:      activateReplacementView(plugin); break;
//         case ViewPosition.tab:              activateTabView(plugin); break;
//         case ViewPosition.verticalSplit:    activateSplitView(plugin, 'horizontal'); break;
//         case ViewPosition.horizontalSplit:  activateSplitView(plugin, 'vertical'); break;
//         default: activateReplacementView(plugin); break;
//     }
//     console.log('DONE')
//     console.log(position)
// }



async function activateReplacementView(plugin: HandwritePlugin, fileRef: TFile) {
    let { workspace }  = plugin.app;
	let leaf = workspace.getLeaf();
    await leaf.openFile(fileRef);
}


async function activateTabView(plugin: HandwritePlugin) {
    let { workspace }  = plugin.app;
	
    let leaf: WorkspaceLeaf | null = null;
	let leaves = workspace.getLeavesOfType(HANDWRITING_VIEW_TYPE);

    // This code finds if it alread existing in a tab and uses that first.
	// if (leaves.length > 0) {
	// 	// A leaf with our view already exists, use that
	// 	leaf = leaves[0];
	// } else {
		// Our view could not be found in the workspace
		leaf = workspace.getLeaf(true);
		await leaf.setViewState({ type: HANDWRITING_VIEW_TYPE, active: true });
	// }

    workspace.revealLeaf(leaf);
}
async function activateSplitView(plugin: HandwritePlugin, direction: 'horizontal' | 'vertical') {
    let { workspace }  = plugin.app;
    
    let leaf: null | WorkspaceLeaf;
    direction == 'vertical' ?   leaf = workspace.getLeaf('split', 'vertical') : 
                                leaf = workspace.getLeaf('split', 'horizontal');

    await leaf.setViewState({ type: HANDWRITING_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
}
