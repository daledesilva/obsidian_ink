import { browser } from "@wdio/globals";
import {
	ACTIVATE_NEXT_EMBED_STORAGE_SUFFIX,
	localStorageKey,
	RECENT_DRAWING_FILE_PATHS_STORAGE_SUFFIX,
	RECENT_WRITING_FILE_PATHS_STORAGE_SUFFIX,
} from "../../../src/logic/utils/storage";

export const activateNextEmbedLocalStorageKey = localStorageKey(ACTIVATE_NEXT_EMBED_STORAGE_SUFFIX);

const recentDrawingFilePathsLocalStorageKey = localStorageKey(RECENT_DRAWING_FILE_PATHS_STORAGE_SUFFIX);
const recentWritingFilePathsLocalStorageKey = localStorageKey(RECENT_WRITING_FILE_PATHS_STORAGE_SUFFIX);

/** Sets the one-shot flag so the next mounted embed auto-opens in edit mode (see docs/activate-next-embed.md). */
export async function setActivateNextEmbedInLocalStorage(): Promise<void> {
	await browser.execute((key: string) => {
		localStorage.setItem(key, "true");
	}, activateNextEmbedLocalStorageKey);
}

/** Clears recent file picker paths so the SVG picker "Recent" section is empty. */
export async function clearRecentFilePathsInLocalStorage(): Promise<void> {
	await browser.execute(
		(drawingKey: string, writingKey: string) => {
			localStorage.removeItem(drawingKey);
			localStorage.removeItem(writingKey);
		},
		recentDrawingFilePathsLocalStorageKey,
		recentWritingFilePathsLocalStorageKey,
	);
}
