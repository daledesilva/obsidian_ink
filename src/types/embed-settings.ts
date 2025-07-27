
export interface EmbedSettings {
    version: number,
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
    version: 1,
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