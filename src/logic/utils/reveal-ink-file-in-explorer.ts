import { TFile } from 'obsidian';
import { getGlobals } from 'src/stores/global-store';

//////////
//////////

interface FileExplorerViewLike {
	revealInFolder?: (file: TFile) => void;
}

/**
 * Open the file explorer if the left dock is closed, expand the ink file's
 * folder, and select it when the explorer view supports revealInFolder.
 * FileExplorerView.revealInFolder is unofficial; skip it if the core plugin is off.
 */
export function revealInkFileInExplorer(file: TFile): void {
	const { workspace } = getGlobals().plugin.app;
	workspace.leftSplit.expand();
	const explorerLeaf = workspace.getLeavesOfType('file-explorer')[0];
	if (!explorerLeaf) return;
	void workspace.revealLeaf(explorerLeaf);
	const explorerView = explorerLeaf.view as FileExplorerViewLike;
	explorerView.revealInFolder?.(file);
}
