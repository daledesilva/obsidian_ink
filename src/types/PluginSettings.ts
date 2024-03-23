////////
////////

export interface PluginSettings {
	writingEnabled: boolean,
	drawingEnabled: boolean,
    useDefaultAttachmentFolder: boolean,
}

export const DEFAULT_SETTINGS: PluginSettings = {
	writingEnabled: true,
	drawingEnabled: false,
    useDefaultAttachmentFolder: true,
}