////////
////////

export interface PluginSettings {
	// Helpers
    onboardingTips: {
		welcomeTipRead: boolean,
		strokeLimitTipRead: boolean,
	},
	// General
	customAttachmentFolders: boolean,
    useObsidianAttachmentFolder: boolean,
	useSubfolders: boolean,
	writingSubfolder: string,
	drawingSubfolder: string,
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
	// Helpers
    onboardingTips: {
		welcomeTipRead: false,
		strokeLimitTipRead: false,
	},
	// General
	customAttachmentFolders: false,
    useObsidianAttachmentFolder: true,
	useSubfolders: true,
	writingSubfolder: 'Ink/Writing',
	drawingSubfolder: 'Ink/Drawing',
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