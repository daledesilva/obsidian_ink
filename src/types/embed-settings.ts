import { EMBED_SETTINGS_VERSION, WRITING_PAGE_WIDTH } from 'src/constants';

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

/** Embed settings for a newly inserted blank drawing embed (writing-aligned page scale). */
export function buildNewDrawingEmbedSettings(): EmbedSettings {
    const aspectRatio = DEFAULT_EMBED_SETTINGS.embedDisplay.aspectRatio;
    return {
        ...DEFAULT_EMBED_SETTINGS,
        embedDisplay: { ...DEFAULT_EMBED_SETTINGS.embedDisplay },
        viewBox: {
            x: 0,
            y: 0,
            width: WRITING_PAGE_WIDTH,
            height: WRITING_PAGE_WIDTH / aspectRatio,
        },
    };
}

/** True when the embed uses the new blank-drawing viewBox width (matches writing page scale). */
export function isWritingAlignedDrawingEmbed(settings: EmbedSettings): boolean {
    return settings.viewBox.width === WRITING_PAGE_WIDTH;
}