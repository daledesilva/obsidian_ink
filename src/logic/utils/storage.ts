import { PLUGIN_KEY } from "src/constants";

/////////
/////////

export const saveLocally = (key: string, value: string | boolean) => {
    if(typeof value === 'boolean') {
        value = value.toString();
    }
    localStorage.setItem(`${PLUGIN_KEY}_${key}`, value);
}

export const fetchLocally = (key: string) => {
    let value: null | string | boolean = localStorage.getItem(`${PLUGIN_KEY}_${key}`);
    if(value === null) return null;
    if(value === 'true') value = true;
    if(value === 'false') value = false;
    return value;
}

export const deleteLocally = (key: string) => {
    localStorage.removeItem(`${PLUGIN_KEY}_${key}`);
}

export const activateNextEmbed = () => {
    saveLocally('activateNextEmbed', true);
}

export const embedShouldActivateImmediately = () => {
    const result = fetchLocally('activateNextEmbed');
    deleteLocally('activateNextEmbed');
    return result;
}

const RECENT_DRAWING_PATHS_KEY = 'recentDrawingFilePaths';
const RECENT_WRITING_PATHS_KEY = 'recentWritingFilePaths';
const RECENT_PATHS_MAX_LENGTH = 10;

export const fetchRecentFilePaths = (fileType: 'inkWriting' | 'inkDrawing'): string[] => {
    const key = fileType === 'inkDrawing' ? RECENT_DRAWING_PATHS_KEY : RECENT_WRITING_PATHS_KEY;
    const raw = fetchLocally(key);
    if (typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string').slice(0, RECENT_PATHS_MAX_LENGTH);
    } catch {
        return [];
    }
};

export const recordRecentFileSelection = (fileType: 'inkWriting' | 'inkDrawing', filepath: string): void => {
    const key = fileType === 'inkDrawing' ? RECENT_DRAWING_PATHS_KEY : RECENT_WRITING_PATHS_KEY;
    const current = fetchRecentFilePaths(fileType);
    const deduped = [filepath, ...current.filter(path => path !== filepath)];
    const trimmed = deduped.slice(0, RECENT_PATHS_MAX_LENGTH);
    saveLocally(key, JSON.stringify(trimmed));
};