import type { WorkspaceLeaf } from 'obsidian';
import { getGlobals } from 'src/stores/global-store';

//////////
//////////

/** Body class that hides the ribbon, tab strip, leaf view header, and status bar. */
export const INK_WORKSPACE_CHROME_HIDDEN_CLASS = 'ddc_ink_hide-workspace-chrome';

interface SidebarSnapshot {
	leftWasCollapsed: boolean;
	rightWasCollapsed: boolean;
}

export interface EnterInkWorkspaceChromeOptions {
	/**
	 * Collapse the side docks and remember their previous state for exit.
	 * Embed expand already collapsed them via openInkFileInView, so that path
	 * passes false and leaves restoration to the view's close handler.
	 */
	collapseSidebars: boolean;
	/**
	 * Exit full screen should return to the note. Only the embed expand path
	 * sets this; a later full-screen toggle from the dedicated view itself does not.
	 */
	openedFromEmbed: boolean;
}

let chromeHiddenLeafId: string | null = null;
let openedFromEmbed = false;
let sidebarSnapshot: SidebarSnapshot | null = null;
let pendingHideForNextDedicatedView = false;
let leafListenerRegistered = false;

const listeners = new Set<() => void>();

/** Subscribe to full-screen session changes for the dedicated editors. */
export function subscribeInkWorkspaceChrome(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** True when this leaf owns the current full-screen session. */
export function isInkWorkspaceChromeHiddenForLeaf(leafId: string): boolean {
	return chromeHiddenLeafId === leafId;
}

/**
 * True when full screen was started from an embed, so Exit should return to the note.
 */
export function wasInkWorkspaceOpenedFromEmbed(leafId: string): boolean {
	return chromeHiddenLeafId === leafId && openedFromEmbed;
}

/** Whether the leaf can navigate back to the note that opened it. */
export function leafHasBackHistory(leaf: WorkspaceLeaf): boolean {
	return leaf.history.backHistory.length > 0;
}

/**
 * Ask the next dedicated ink view to start in full screen.
 * Called from the embed expand button before the view opens.
 */
export function requestInkWorkspaceChromeForNextDedicatedView(): void {
	pendingHideForNextDedicatedView = true;
}

/** Drop a pending full-screen request when opening the dedicated view fails. */
export function cancelPendingInkWorkspaceChromeHide(): void {
	pendingHideForNextDedicatedView = false;
}

/**
 * Apply a pending embed full-screen request to this dedicated view.
 * Sidebars stay as openInkFileInView left them. No-op when nothing is pending,
 * including later setViewData calls for the same leaf.
 */
export function applyPendingInkWorkspaceChromeHide(leafId: string): void {
	if (!pendingHideForNextDedicatedView) return;
	pendingHideForNextDedicatedView = false;
	enterInkWorkspaceChromeHidden(leafId, {
		collapseSidebars: false,
		openedFromEmbed: true,
	});
}

/**
 * Hide workspace chrome for a dedicated ink leaf and, when asked, collapse sidebars.
 */
export function enterInkWorkspaceChromeHidden(
	leafId: string,
	options: EnterInkWorkspaceChromeOptions,
): void {
	ensureActiveLeafListener();

	const isDifferentLeaf = chromeHiddenLeafId !== leafId;
	if (isDifferentLeaf) {
		// The previous leaf's sidebar snapshot must not leak into this session.
		restoreSidebarSnapshot();
		sidebarSnapshot = null;
		openedFromEmbed = options.openedFromEmbed;
		chromeHiddenLeafId = leafId;
	}

	if (options.collapseSidebars && !sidebarSnapshot) {
		const { workspace } = getGlobals().plugin.app;
		sidebarSnapshot = {
			leftWasCollapsed: workspace.leftSplit.collapsed,
			rightWasCollapsed: workspace.rightSplit.collapsed,
		};
		workspace.leftSplit.collapse();
		workspace.rightSplit.collapse();
	}

	syncBodyClass();
	notifyListeners();
}

/**
 * Leave full screen for this leaf: show chrome again and restore sidebars
 * collapsed by this session. Other leaves are left alone.
 */
export function exitInkWorkspaceChromeHidden(leafId: string): void {
	if (chromeHiddenLeafId !== leafId) return;
	restoreSidebarSnapshot();
	sidebarSnapshot = null;
	openedFromEmbed = false;
	chromeHiddenLeafId = null;
	syncBodyClass();
	notifyListeners();
}

/** Navigate this leaf back to the previous view (the note, when opened from an embed). */
export function navigateInkLeafBack(leafId: string): void {
	const leaf = getGlobals().plugin.app.workspace.getLeafById(leafId);
	if (!leaf) return;
	if (!leafHasBackHistory(leaf)) return;
	void leaf.history.back();
}

/** Plugin unload: drop the body class and undo a sidebar collapse this session owns. */
export function releaseInkWorkspaceChromeOnPluginUnload(): void {
	pendingHideForNextDedicatedView = false;
	if (chromeHiddenLeafId) {
		exitInkWorkspaceChromeHidden(chromeHiddenLeafId);
		return;
	}
	document.body.classList.remove(INK_WORKSPACE_CHROME_HIDDEN_CLASS);
	notifyListeners();
}

/** Clears module state between unit tests. */
export function resetInkWorkspaceChromeForTests(): void {
	chromeHiddenLeafId = null;
	openedFromEmbed = false;
	sidebarSnapshot = null;
	pendingHideForNextDedicatedView = false;
	leafListenerRegistered = false;
	document.body.classList.remove(INK_WORKSPACE_CHROME_HIDDEN_CLASS);
	listeners.clear();
}

/** Re-read active leaf so chrome hides only while the ink leaf is focused. */
function ensureActiveLeafListener(): void {
	if (leafListenerRegistered) return;
	leafListenerRegistered = true;
	const plugin = getGlobals().plugin;
	plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', () => {
		syncBodyClass();
	}));
}

/** Body class follows the active leaf so switching notes brings chrome back. */
function syncBodyClass(): void {
	const activeLeafId = getGlobals().plugin.app.workspace.activeLeaf?.id ?? null;
	const shouldHide = chromeHiddenLeafId != null && activeLeafId === chromeHiddenLeafId;
	document.body.classList.toggle(INK_WORKSPACE_CHROME_HIDDEN_CLASS, shouldHide);
}

/** Put side docks back to the state captured when this full-screen session started. */
function restoreSidebarSnapshot(): void {
	if (!sidebarSnapshot) return;
	const { workspace } = getGlobals().plugin.app;
	if (!sidebarSnapshot.leftWasCollapsed) workspace.leftSplit.expand();
	if (!sidebarSnapshot.rightWasCollapsed) workspace.rightSplit.expand();
}

/** Tell mounted editors to re-read the session. */
function notifyListeners(): void {
	for (const listener of listeners) listener();
}
