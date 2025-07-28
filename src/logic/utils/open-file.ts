import { TFile } from "obsidian";
import { getGlobals } from "src/stores/global-store";

////////////////////////////////
////////////////////////////////

export async function openInkFile(fileRef: TFile) {
    // switch(position) {
        // case ViewPosition.replacement:      openInActiveView(plugin, fileRef); break;
        // case ViewPosition.tab:              activateTabView(plugin, fileRef); break;
        // case ViewPosition.verticalSplit:    activateSplitView(plugin, fileRef, 'horizontal'); break;
        // case ViewPosition.horizontalSplit:  activateSplitView(plugin, fileRef, 'vertical'); break;
        // default: openInCurrentView(plugin, fileRef); break;
    // }

    openInActiveView(fileRef);
}

export async function openInActiveView(fileRef: TFile) {
    let { workspace }  = getGlobals().plugin.app;
	let leaf = workspace.getLeaf();
    await leaf.openFile(fileRef);
}

// NOTE: Future possible additions

// async function activateTabView(plugin: InkPlugin) {
//     let { workspace }  = plugin.app;
	
//     let leaf: WorkspaceLeaf | null = null;
// 	let leaves = workspace.getLeavesOfType(WRITING_VIEW_TYPE);

//     // This code finds if it alread existing in a tab and uses that first.
// 	// if (leaves.length > 0) {
// 	// 	// A leaf with our view already exists, use that
// 	// 	leaf = leaves[0];
// 	// } else {
// 		// Our view could not be found in the workspace
// 		leaf = workspace.getLeaf(true);
// 		await leaf.setViewState({ type: WRITING_VIEW_TYPE, active: true });
// 	// }

//     workspace.revealLeaf(leaf);
// }

// async function activateSplitView(plugin: InkPlugin, direction: 'horizontal' | 'vertical') {
//     let { workspace }  = plugin.app;
    
//     let leaf: null | WorkspaceLeaf;
//     direction == 'vertical' ?   leaf = workspace.getLeaf('split', 'vertical') : 
//                                 leaf = workspace.getLeaf('split', 'horizontal');

//     await leaf.setViewState({ type: WRITING_VIEW_TYPE, active: true });
//     workspace.revealLeaf(leaf);
// }
