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
 * Also collapses the sidebars to maximise canvas space.
 */
export async function openInkFileInView(
	fileRef: TFile,
	viewType: 'inkWriting' | 'inkDrawing',
) {
	const plugin = getGlobals().plugin;
	const { workspace } = plugin.app;
	const leaf = workspace.getLeaf();
	const type = viewType === 'inkDrawing' ? DRAWING_VIEW_TYPE : WRITING_VIEW_TYPE;

	// Check BEFORE opening so the new view isn't counted as "already open"
	const inkViewAlreadyOpen = [
		...workspace.getLeavesOfType(DRAWING_VIEW_TYPE),
		...workspace.getLeavesOfType(WRITING_VIEW_TYPE),
	].length > 0;

	await leaf.setViewState({
		type,
		state: { file: fileRef.path },
		active: true,
	});

	if (!inkViewAlreadyOpen) {
		plugin.inkViewSidebarState = {
			leftWasCollapsed: workspace.leftSplit.collapsed,
			rightWasCollapsed: workspace.rightSplit.collapsed,
		};
		workspace.leftSplit.collapse();
		workspace.rightSplit.collapse();
	}
}

/**
 * Restores sidebar state that was captured before opening a dedicated ink view.
 * Should be called from onClose() of DrawingView and WritingView.
 * Defers the check to ensure the closing leaf is fully removed first.
 */
export function restoreSidebarsAfterInkView() {
	const plugin = getGlobals().plugin;
	const { workspace } = plugin.app;
	setTimeout(() => {
		const remainingInkLeaves = [
			...workspace.getLeavesOfType(DRAWING_VIEW_TYPE),
			...workspace.getLeavesOfType(WRITING_VIEW_TYPE),
		];
		if (remainingInkLeaves.length > 0) return;
		const state = plugin.inkViewSidebarState;
		if (!state) return;
		if (!state.leftWasCollapsed) workspace.leftSplit.expand();
		if (!state.rightWasCollapsed) workspace.rightSplit.expand();
		plugin.inkViewSidebarState = null;
	}, 0);
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
