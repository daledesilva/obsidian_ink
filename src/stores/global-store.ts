import { atom, getDefaultStore } from 'jotai'
import InkPlugin from "src/main";

/////////
/////////

interface StaticGlobals {
	plugin: InkPlugin,
}

// TODO: When the plugin reloads this causes an error because the Jotai store is not properly cleaned up and then it is created again.
// It causes state transitions to not work when the plugin is reloaded.
export const globalsAtom = atom<StaticGlobals>()
export function setGlobals(globals: StaticGlobals): void {
	const store = getDefaultStore();
	store.set(globalsAtom, globals);
}
export function getGlobals(): StaticGlobals {
	const store = getDefaultStore();
	const globals = store.get(globalsAtom);
	if(!globals) {
		throw new Error(`Project Browser plugin globals isn't available yet`);
	}
	return globals;
}
