import { LOCAL_STORAGE_PREFIX } from "src/constants";
import { WritableAtom, atom, createStore, getDefaultStore } from 'jotai'
import { atomWithStorage } from 'jotai/utils'


//////////
//////////

export const deviceMemoryStore = createStore();
export const showHiddenFoldersAtom = atomWithStorage(LOCAL_STORAGE_PREFIX + 'show-hidden-folders', false)

export function hideHiddenFolders() {
    deviceMemoryStore.set(showHiddenFoldersAtom, false);
}
export function unhideHiddenFolders() {
    deviceMemoryStore.set(showHiddenFoldersAtom, true);
}
/***
 * Fetch the current state of the showHiddenFolders Atom.
 * Use 'useAtomValue(showHiddenFoldersAtom) in React instead.
 */
export function getShowHiddenFolders(): boolean {
    return deviceMemoryStore.get(showHiddenFoldersAtom);
}

