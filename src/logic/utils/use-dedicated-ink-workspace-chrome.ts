import * as React from 'react';
import { getGlobals } from 'src/stores/global-store';
import {
	enterInkWorkspaceChromeHidden,
	exitInkWorkspaceChromeHidden,
	isInkWorkspaceChromeHiddenForLeaf,
	leafHasBackHistory,
	navigateInkLeafBack,
	subscribeInkWorkspaceChrome,
	wasInkWorkspaceOpenedFromEmbed,
} from 'src/logic/utils/ink-workspace-chrome';

//////////
//////////

export interface DedicatedInkWorkspaceChrome {
	isWorkspaceChromeHidden: boolean;
	onEnterWorkspaceChrome: () => void;
	onExitWorkspaceChrome: () => void;
}

/**
 * Full-screen session for a dedicated ink view: chrome visibility and an Exit
 * control that returns to the note when this session was opened from an embed.
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

	return {
		isWorkspaceChromeHidden,
		onEnterWorkspaceChrome: () => {
			// Dedicated-view full screen hides the side docks itself. Exit restores
			// that snapshot instead of returning to a note.
			enterInkWorkspaceChromeHidden(leafId, {
				collapseSidebars: true,
				openedFromEmbed: false,
			});
		},
		onExitWorkspaceChrome: () => {
			// Embed origin: history.back returns to the note. View onClose restores docks.
			if (wasInkWorkspaceOpenedFromEmbed(leafId)) {
				const leaf = getGlobals().plugin.app.workspace.getLeafById(leafId);
				if (leaf && leafHasBackHistory(leaf)) {
					navigateInkLeafBack(leafId);
					return;
				}
			}
			exitInkWorkspaceChromeHidden(leafId);
		},
	};
}
