import { getDefaultStore } from 'jotai'
import { atom } from 'jotai'
import { verbose } from 'src/logic/utils/universal-dev-logging'
import { logToVault } from 'src/logic/utils/log-to-vault'

///////////////////////////////
///////////////////////////////

/**
 * When Boox connection is enabled, only one ink embed (writing or drawing) may be
 * unlocked at a time because there can only be one Boox overlay active.
 *
 * This store holds a `saveAndHalt` callback for the currently active embed so that
 * any new embed can close the previous one before opening itself.
 */

export type SaveAndHaltFn = () => Promise<void>;

interface ActiveInkEmbed {
	embedId: string;
	saveAndHalt: SaveAndHaltFn;
}

export const activeInkEmbedAtom = atom<ActiveInkEmbed | null>(null);

/**
 * Save-and-close the currently active ink embed (if any), then register the new one.
 * Call this from `switchToEditMode` in both writing and drawing embeds when Boox is enabled.
 */
export async function replaceActiveInkEmbed(embedId: string, saveAndHalt: SaveAndHaltFn): Promise<void> {
	const store = getDefaultStore();
	const previous = store.get(activeInkEmbedAtom);

	if (previous && previous.embedId !== embedId) {
		verbose(['Closing previous active ink embed before opening new one', {
			previousEmbedId: previous.embedId,
			newEmbedId: embedId,
		}]);
		logToVault('Closing previous active ink embed ' + previous.embedId + ' for new embed ' + embedId);
		await previous.saveAndHalt();
	}

	store.set(activeInkEmbedAtom, { embedId, saveAndHalt });
}

/**
 * Clear the active-embed registration when an embed closes.
 * Only clears if the stored embedId still matches (guards against race conditions).
 */
export function clearActiveInkEmbed(embedId: string): void {
	const store = getDefaultStore();
	const current = store.get(activeInkEmbedAtom);
	if (current && current.embedId === embedId) {
		store.set(activeInkEmbedAtom, null);
	}
}
