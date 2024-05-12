////////
////////

export interface PluginSettings {
	// General
    useDefaultAttachmentFolder: boolean,
	// Writing specific
	writingEnabled: boolean,
	writingStrokeLimit: number,
	writingDynamicStrokeThickness: boolean,
	writingSmoothing: boolean,
	writingLinesWhenLocked: boolean,
	writingBackgroundWhenLocked: boolean,
	// Drawing specific
	drawingEnabled: boolean,
}

export const DEFAULT_SETTINGS: PluginSettings = {
	// General
    useDefaultAttachmentFolder: true,
	// Writing specific
	writingEnabled: true,
	writingStrokeLimit: 200,
	writingDynamicStrokeThickness: true,
	writingSmoothing: false,
	writingLinesWhenLocked: true,
	writingBackgroundWhenLocked: false,
	// Drawing specific
	drawingEnabled: false,
}