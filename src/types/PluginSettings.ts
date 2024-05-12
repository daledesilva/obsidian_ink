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
	drawingFrameWhenLocked: boolean,
	drawingBackgroundWhenLocked: boolean,
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
	writingBackgroundWhenLocked: true,
	// Drawing specific
	drawingEnabled: false,
	drawingFrameWhenLocked: false,
	drawingBackgroundWhenLocked: false,
}