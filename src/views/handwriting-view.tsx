import { Editor, Tldraw } from "@tldraw/tldraw";
import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import HandwritePlugin from "src/main";

////////
////////

export const HANDWRITING_VIEW_TYPE = "handwriting-view";
export enum ViewPosition {
    replacement,
    tab,
    verticalSplit,
    horizontalSplit
}


export class HandwritingView extends ItemView {
    root: Root;
    plugin: HandwritePlugin;

    constructor(leaf: WorkspaceLeaf, plugin: HandwritePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return HANDWRITING_VIEW_TYPE;
    }

    getDisplayText() {
        return "Handwritten note";
    }

    async onOpen() {
        const bodyEl = this.containerEl.children[1];

        const sourcePath = `Handwriting/7-nov-2021.byhand.md`;

        const v = this.plugin.app.vault;
		const fileRef = v.getAbstractFileByPath(sourcePath)
		if( !(fileRef instanceof TFile) ) {
			console.error(`File not found.`);
			return;
		}
		const sourceJson = await v.cachedRead(fileRef as TFile);

        const rootEl = bodyEl.createEl("div");
		this.root = createRoot(rootEl);
		this.root.render(
			<ReactApp
				sourceJson = {sourceJson}
			/>
		);
		bodyEl.replaceWith(rootEl);
    }

    async onClose() {
        // Nothing to clean up.
    }
}




const ReactApp = (props: {sourceJson: string}) => {
	// const assetUrls = getAssetUrlsByMetaUrl();

	const handleMount = (editor: Editor) => {
		editor.zoomToFit()
		editor.updateInstanceState({
			// isDebugMode: false,
		})
	}

    return <>
		<div
			style = {{
                position: 'absolute',
				width: '100%',
				height: '100%'
			}}
		>
			<Tldraw
				snapshot = {JSON.parse(props.sourceJson)}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
			/>
		</div>
	</>;
	
};




export async function activateHandwritingView(plugin: HandwritePlugin, position: ViewPosition = ViewPosition.replacement) {
	switch(position) {
        case ViewPosition.replacement:      activateReplacementView(plugin); break;
        case ViewPosition.tab:              activateTabView(plugin); break;
        case ViewPosition.verticalSplit:    activateSplitView(plugin, 'horizontal'); break;
        case ViewPosition.horizontalSplit:  activateSplitView(plugin, 'vertical'); break;
        default: activateReplacementView(plugin); break;
    }
    console.log('DONE')
    console.log(position)
}

async function activateReplacementView(plugin: HandwritePlugin) {
    let { workspace }  = plugin.app;
	let leaf = workspace.getLeaf();
    await leaf.setViewState({ type: HANDWRITING_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
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
