import { TFile } from "obsidian";
import { getGlobals } from "src/stores/global-store";
import { WRITING_VIEW_TYPE } from "src/components/formats/current/writing/writing-view/writing-view";
import { DRAWING_VIEW_TYPE } from "src/components/formats/current/drawing/drawing-view/drawing-view";

////////////////////////////////
////////////////////////////////

export async function openInkFile(fileRef: TFile) {
    openInActiveView(fileRef);
}

export async function openInActiveView(fileRef: TFile) {
    const { workspace } = getGlobals().plugin.app;
	const leaf = workspace.getLeaf();
    await leaf.openFile(fileRef);
}

/**
 * Opens an ink file in the matching view type (writing or drawing).
 * Use after conversion so the file opens in the correct editor.
 */
export async function openInkFileInView(
	fileRef: TFile,
	viewType: 'inkWriting' | 'inkDrawing',
) {
	const { workspace } = getGlobals().plugin.app;
	const leaf = workspace.getLeaf();
	const type = viewType === 'inkDrawing' ? DRAWING_VIEW_TYPE : WRITING_VIEW_TYPE;
	await leaf.setViewState({
		type,
		state: { file: fileRef.path },
		active: true,
	});
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
