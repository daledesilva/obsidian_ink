import { EmbedSettings, DEFAULT_EMBED_SETTINGS } from 'src/types/embed-settings';

////////
////////

/** Result of reading embed settings out of an Edit link URL. */
export interface ParsedEmbedUrlSettings {
    infoUrl: string;
    embedSettings: EmbedSettings;
    isPendingPaste: boolean;
    /**
     * True when the URL carried explicit viewBox params.
     *
     * Why this matters: a drawing SVG stores its own authoritative viewBox. When the embed URL has
     * no viewBox (older embeds, or embeds whose params were lost), applying the default
     * `0 0 500 281` crops or offsets the drawing relative to its real content. The preview uses this
     * flag to fall back to the file's own viewBox instead (#180).
     */
    hasExplicitViewBox: boolean;
}

export function parseSettingsFromUrl(urlAndEmbedSettings: string): ParsedEmbedUrlSettings {

    let infoUrl = urlAndEmbedSettings;
    let embedSettings: EmbedSettings = structuredClone(DEFAULT_EMBED_SETTINGS);
    let isPendingPaste = false;
    let hasExplicitViewBox = false;

    const questionMarkIndex = urlAndEmbedSettings.indexOf('?');
    if (questionMarkIndex !== -1) {
        infoUrl = urlAndEmbedSettings.substring(0, questionMarkIndex);
        const embedSettingsStr = urlAndEmbedSettings.substring(questionMarkIndex + 1);

        // Parse URL parameters into a flat object first
        const urlParams = embedSettingsStr.split('&').reduce((acc, pair) => {
            const [key, value] = pair.split('=');
            if (key && value) {
                acc[key] = decodeURIComponent(value);
            }
            return acc;
        }, {} as Record<string, string>);

        // Apply parsed values to embedSettings with proper type conversion
        if (urlParams.width) {
            embedSettings.embedDisplay.width = parseFloat(urlParams.width);
        }
        if (urlParams.aspectRatio) {
            embedSettings.embedDisplay.aspectRatio = parseFloat(urlParams.aspectRatio);
        }
        if (urlParams.viewBoxX) {
            embedSettings.viewBox.x = parseFloat(urlParams.viewBoxX);
        }
        if (urlParams.viewBoxY) {
            embedSettings.viewBox.y = parseFloat(urlParams.viewBoxY);
        }
        // Prefer new param names, but keep backward compatibility.
        if (urlParams.viewBoxW) {
            embedSettings.viewBox.width = parseFloat(urlParams.viewBoxW);
        } else if (urlParams.viewBoxWidth) {
            embedSettings.viewBox.width = parseFloat(urlParams.viewBoxWidth);
        }
        if (urlParams.viewBoxH) {
            embedSettings.viewBox.height = parseFloat(urlParams.viewBoxH);
        } else if (urlParams.viewBoxHeight) {
            embedSettings.viewBox.height = parseFloat(urlParams.viewBoxHeight);
        }
        if (urlParams.pendingPaste === 'true') {
            isPendingPaste = true;
        }

        const hasViewBoxSizeParam = !!(urlParams.viewBoxW || urlParams.viewBoxWidth || urlParams.viewBoxH || urlParams.viewBoxHeight);
        hasExplicitViewBox = hasViewBoxSizeParam;
    }
    return { infoUrl, embedSettings, isPendingPaste, hasExplicitViewBox };
}
