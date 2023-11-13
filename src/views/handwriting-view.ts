import { ItemView, WorkspaceLeaf } from "obsidian";
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
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() {
        return HANDWRITING_VIEW_TYPE;
    }

    getDisplayText() {
        return "Handwriten note";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl("h4", { text: "Example view" });
    }

    async onClose() {
        // Nothing to clean up.
    }
}




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
