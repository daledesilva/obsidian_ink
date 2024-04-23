////////
////////

export interface PluginSettings {
    useDefaultAttachmentFolder: boolean,

	writingEnabled: boolean,
	writingStrokeLimit: number,

	drawingEnabled: boolean,
}

export const DEFAULT_SETTINGS: PluginSettings = {
    useDefaultAttachmentFolder: true,

	writingEnabled: true,
	writingStrokeLimit: 200,

	drawingEnabled: false,
}