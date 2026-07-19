import { LOCAL_STORAGE_PREFIX } from "src/constants";

/** Full `localStorage` key: `LOCAL_STORAGE_PREFIX` + suffix (e.g. `au_ink_activateNextEmbed`). */
export function localStorageKey(storageSuffix: string): string {
	return `${LOCAL_STORAGE_PREFIX}${storageSuffix}`;
}

export const ACTIVATE_NEXT_EMBED_STORAGE_SUFFIX = 'activateNextEmbed';
export const RECENT_DRAWING_FILE_PATHS_STORAGE_SUFFIX = 'recentDrawingFilePaths';
export const RECENT_WRITING_FILE_PATHS_STORAGE_SUFFIX = 'recentWritingFilePaths';

/////////
/////////

/** Uses Obsidian popout-compatible host window; avoids the restricted `localStorage` global identifier. */
const vaultKeyedStorage = (): Storage => window.activeWindow.localStorage;

export const saveLocally = (key: string, value: string | boolean) => {
    if(typeof value === 'boolean') {
        value = value.toString();
    }
    vaultKeyedStorage().setItem(localStorageKey(key), value);
}

export const fetchLocally = (key: string) => {
    let value: null | string | boolean = vaultKeyedStorage().getItem(localStorageKey(key));
    if(value === null) return null;
    if(value === 'true') value = true;
    if(value === 'false') value = false;
    return value;
}

export const deleteLocally = (key: string) => {
    vaultKeyedStorage().removeItem(localStorageKey(key));
}

/**
 * One-shot flag for "New handwriting section" / "New drawing": the next embed widget that
 * mounts should call switchToEditMode() instead of staying in locked preview. See
 * docs/activate-next-embed.md.
 */
export const activateNextEmbed = () => {
    saveLocally(ACTIVATE_NEXT_EMBED_STORAGE_SUFFIX, true);
}

/** Reads and clears activateNextEmbed; returns whether the new embed should auto-unlock. */
export const embedShouldActivateImmediately = () => {
    const result = fetchLocally(ACTIVATE_NEXT_EMBED_STORAGE_SUFFIX);
    deleteLocally(ACTIVATE_NEXT_EMBED_STORAGE_SUFFIX);
    return result;
}

const RECENT_PATHS_MAX_LENGTH = 10;

export const fetchRecentFilePaths = (fileType: 'inkWriting' | 'inkDrawing'): string[] => {
    const key = fileType === 'inkDrawing' ? RECENT_DRAWING_FILE_PATHS_STORAGE_SUFFIX : RECENT_WRITING_FILE_PATHS_STORAGE_SUFFIX;
    const raw = fetchLocally(key);
    if (typeof raw !== 'string') return [];
    try {
        const parsedUnknown: unknown = JSON.parse(raw);
        if (!Array.isArray(parsedUnknown)) return [];
        return parsedUnknown.filter((item): item is string => typeof item === 'string').slice(0, RECENT_PATHS_MAX_LENGTH);
    } catch {
        return [];
    }
};

export const recordRecentFileSelection = (fileType: 'inkWriting' | 'inkDrawing', filepath: string): void => {
    const key = fileType === 'inkDrawing' ? RECENT_DRAWING_FILE_PATHS_STORAGE_SUFFIX : RECENT_WRITING_FILE_PATHS_STORAGE_SUFFIX;
    const current = fetchRecentFilePaths(fileType);
    const deduped = [filepath, ...current.filter(path => path !== filepath)];
    const trimmed = deduped.slice(0, RECENT_PATHS_MAX_LENGTH);
    saveLocally(key, JSON.stringify(trimmed));
};