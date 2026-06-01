import { EMBED_SETTINGS_VERSION } from 'src/constants';

export interface EmbedSettings {
    version: string,
    embedDisplay: {
        width: number,
        aspectRatio: number,
    },
    viewBox: {
        x: number,
        y: number,
        width: number,
        height: number,
        // rotation: number,
    },
}

export const DEFAULT_EMBED_SETTINGS: EmbedSettings = {
    version: EMBED_SETTINGS_VERSION,
    embedDisplay: {
        width: 500,
        aspectRatio: 16/9,
    },
    viewBox: {
        x: 0,
        y: 0,
        width: 500,
        height: 281,
    },
};

/** Rounded string form for `aspectRatio` in embed URL params. */
export function formatEmbedAspectRatio(aspectRatio: number): string {
    return aspectRatio.toFixed(3);
}