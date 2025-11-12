import { TFile } from "obsidian";
import { getGlobals } from "src/stores/global-store";

////////////////////////////////
////////////////////////////////

export async function openInkFile(fileRef: TFile, currentEmbedState?: string) {
    // 强制在DrawingView中打开文件，确保进入编辑状态
    await openInDrawingView(fileRef);
}

export async function openInActiveView(fileRef: TFile) {
    let { workspace }  = getGlobals().plugin.app;
	let leaf = workspace.getLeaf();
    await leaf.openFile(fileRef);
}

export async function openInDrawingView(fileRef: TFile) {
    let { workspace }  = getGlobals().plugin.app;
    
    // 获取当前活跃的leaf
    let leaf = workspace.activeLeaf;
    if (!leaf) {
        leaf = workspace.getLeaf();
    }
    
    // 强制设置视图状态为DrawingView
    await leaf.setViewState({
        type: "ink_drawing-view",
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
