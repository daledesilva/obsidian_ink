import { TFile } from "obsidian";
import InkPlugin from "src/main";
import { ViewPosition } from "src/views/writing-view";



export async function openInkFileByFilepath(plugin: InkPlugin, filepath: string) {
    const v = plugin.app.vault;
    const fileRef = v.getAbstractFileByPath(filepath) as TFile;
    if(!fileRef) console.log('Filepath being opened is not a file');
    openInkFile(plugin, fileRef);
}
export async function openInkFile(plugin: InkPlugin, fileRef: TFile) {
    // switch(position) {
        // case ViewPosition.replacement:      openInActiveView(plugin, fileRef); break;
        // case ViewPosition.tab:              activateTabView(plugin, fileRef); break;
        // case ViewPosition.verticalSplit:    activateSplitView(plugin, fileRef, 'horizontal'); break;
        // case ViewPosition.horizontalSplit:  activateSplitView(plugin, fileRef, 'vertical'); break;
        // default: openInCurrentView(plugin, fileRef); break;
    // }

    openInActiveView(plugin, fileRef);
}




// Old, probably not necessary


// export async function activateHandwritingView(plugin: InkPlugin, position: ViewPosition = ViewPosition.replacement) {
// 	switch(position) {
//         case ViewPosition.replacement:      openInActiveView(plugin); break;
//         case ViewPosition.tab:              activateTabView(plugin); break;
//         case ViewPosition.verticalSplit:    activateSplitView(plugin, 'horizontal'); break;
//         case ViewPosition.horizontalSplit:  activateSplitView(plugin, 'vertical'); break;
//         default: openInActiveView(plugin); break;
//     }
//     console.log('DONE')
//     console.log(position)
// }




export async function openInActiveView(plugin: InkPlugin, fileRef: TFile) {
    let { workspace }  = plugin.app;
	let leaf = workspace.getLeaf();
    await leaf.openFile(fileRef);
}





async function activateTabView(plugin: InkPlugin) {
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
async function activateSplitView(plugin: InkPlugin, direction: 'horizontal' | 'vertical') {
    let { workspace }  = plugin.app;
    
    let leaf: null | WorkspaceLeaf;
    direction == 'vertical' ?   leaf = workspace.getLeaf('split', 'vertical') : 
                                leaf = workspace.getLeaf('split', 'horizontal');

    await leaf.setViewState({ type: HANDWRITING_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
}
