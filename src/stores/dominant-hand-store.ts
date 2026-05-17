import { atom, getDefaultStore, useAtomValue } from 'jotai';
import { DominantHand } from 'src/types/plugin-settings_0_5_0';

export const dominantHandAtom = atom<DominantHand>('right');

const dominantHandStore = getDefaultStore();

export function setDominantHand(value: DominantHand): void {
	dominantHandStore.set(dominantHandAtom, value);
}

export function getDominantHand(): DominantHand {
	return dominantHandStore.get(dominantHandAtom);
}

/** Reads the global dominant-hand setting from the default Jotai store (not an embed-local Provider store). */
export function useDominantHand(): DominantHand {
	return useAtomValue(dominantHandAtom, { store: dominantHandStore });
}
