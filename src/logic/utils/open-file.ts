import { TFile } from "obsidian";
import { getGlobals } from "src/stores/global-store";

////////////////////////////////
////////////////////////////////

export async function openInkFile(fileRef: TFile, currentEmbedState?: string, viewType?: 'inkDrawing' | 'inkWriting') {
    // 根据视图类型决定使用哪种视图打开文件
    if (viewType === 'inkWriting') {
        await openInWritingView(fileRef);
    } else {
        // 默认使用DrawingView
        await openInDrawingView(fileRef);
    }
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

export async function openInWritingView(fileRef: TFile) {
    let { workspace }  = getGlobals().plugin.app;
    
    // 获取当前活跃的leaf
    let leaf = workspace.activeLeaf;
    if (!leaf) {
        leaf = workspace.getLeaf();
    }
    
    // 强制设置视图状态为WritingView
    await leaf.setViewState({
        type: "ink_writing-view",
        state: { file: fileRef.path },
        active: true,
    });
}
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
