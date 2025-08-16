import { EmbedSettings, DEFAULT_EMBED_SETTINGS } from 'src/types/embed-settings';

export function parseSettingsFromUrl(urlAndEmbedSettings: string): { infoUrl: string; embedSettings: EmbedSettings; } {

    let infoUrl = urlAndEmbedSettings;
    let embedSettings: EmbedSettings = JSON.parse(JSON.stringify(DEFAULT_EMBED_SETTINGS));

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
        if (urlParams.version) {
            embedSettings.version = parseInt(urlParams.version, 10);
        }
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
        if (urlParams.viewBoxWidth) {
            embedSettings.viewBox.width = parseFloat(urlParams.viewBoxWidth);
        }
        if (urlParams.viewBoxHeight) {
            embedSettings.viewBox.height = parseFloat(urlParams.viewBoxHeight);
        }
    }
    return { infoUrl, embedSettings };
}
