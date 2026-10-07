import * as React from 'react';
import { getGlobals } from 'src/stores/global-store';
import {
	enterInkWorkspaceChromeHidden,
	exitInkWorkspaceChromeHidden,
	isInkWorkspaceChromeHiddenForLeaf,
	leafHasBackHistory,
	navigateInkLeafBack,
	shouldOfferInkWorkspaceNavigateBack,
	subscribeInkWorkspaceChrome,
	subscribeLeafHistoryChange,
} from 'src/logic/utils/ink-workspace-chrome';

//////////
//////////

export interface DedicatedInkWorkspaceChrome {
	isWorkspaceChromeHidden: boolean;
	showNavigateBack: boolean;
	onEnterWorkspaceChrome: () => void;
	onExitWorkspaceChrome: () => void;
	onNavigateBack: () => void;
}

/**
 * Full-screen session for a dedicated ink view: chrome visibility, the exit
 * control, and a floating back control when this session was opened from an embed.
 */
export function useDedicatedInkWorkspaceChrome(
	leafId: string,
	isDedicatedView: boolean,
): DedicatedInkWorkspaceChrome {
	const isWorkspaceChromeHidden = React.useSyncExternalStore(
		subscribeInkWorkspaceChrome,
		() => isDedicatedView && isInkWorkspaceChromeHiddenForLeaf(leafId),
		() => false,
	);
	const [canNavigateBack, setCanNavigateBack] = React.useState(() => (
		readCanNavigateBack(leafId, isDedicatedView)
	));

	React.useEffect(() => {
		if (!isDedicatedView || !isWorkspaceChromeHidden) {
			setCanNavigateBack(false);
			return;
		}
		if (!shouldOfferInkWorkspaceNavigateBack(leafId)) {
			setCanNavigateBack(false);
			return;
		}
		const leaf = getGlobals().plugin.app.workspace.getLeafById(leafId);
		if (!leaf) {
			setCanNavigateBack(false);
			return;
		}
		const historyLeaf = leaf;

		/** History can land just after the view opens, after the header's own listener. */
		function updateCanNavigateBack() {
			setCanNavigateBack(leafHasBackHistory(historyLeaf));
		}

		updateCanNavigateBack();
		const eventRef = subscribeLeafHistoryChange(leaf, updateCanNavigateBack);
		const immediateTimeoutId = window.setTimeout(updateCanNavigateBack, 0);
		const lateTimeoutId = window.setTimeout(updateCanNavigateBack, 100);
		return () => {
			window.clearTimeout(immediateTimeoutId);
			window.clearTimeout(lateTimeoutId);
			getGlobals().plugin.app.workspace.offref(eventRef);
		};
	}, [isDedicatedView, isWorkspaceChromeHidden, leafId]);

	const showNavigateBack = isWorkspaceChromeHidden
		&& shouldOfferInkWorkspaceNavigateBack(leafId)
		&& canNavigateBack;

	return {
		isWorkspaceChromeHidden,
		showNavigateBack,
		onEnterWorkspaceChrome: () => {
			// Dedicated-view full screen hides the side docks itself. No floating
			// back control: the view header returns on exit and holds Navigate back.
			enterInkWorkspaceChromeHidden(leafId, {
				collapseSidebars: true,
				showNavigateBack: false,
			});
		},
		onExitWorkspaceChrome: () => {
			exitInkWorkspaceChromeHidden(leafId);
		},
		onNavigateBack: () => {
			navigateInkLeafBack(leafId);
		},
	};
}

/** Back history is often already on the leaf by the time the dedicated view paints. */
function readCanNavigateBack(leafId: string, isDedicatedView: boolean): boolean {
	if (!isDedicatedView) return false;
	if (!shouldOfferInkWorkspaceNavigateBack(leafId)) return false;
	const leaf = getGlobals().plugin.app.workspace.getLeafById(leafId);
	if (!leaf) return false;
	return leafHasBackHistory(leaf);
}
