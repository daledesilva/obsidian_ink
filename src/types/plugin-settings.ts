////////
////////

export interface PluginSettings {
	// Helpers
    onboardingTips: {
		welcomeTipRead: boolean,
		strokeLimitTipRead: boolean,
		lastVersionTipRead: string,
	},
	// General
	gettingStartedExpanded: boolean,
	customAttachmentFolders: boolean,
    noteAttachmentFolderLocation: 'obsidian' | 'root' | 'note',
    notelessAttachmentFolderLocation: 'obsidian' | 'root',
	writingSubfolder: string,
	drawingSubfolder: string,
	booxConnectionEnabled: boolean,
	debugLoggingEnabled: boolean,
	// Writing specific
	writingEnabled: boolean,
	writingStrokeLimit: number,
	writingBufferLines: number,
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
		lastVersionTipRead: '',
	},
	// General
	gettingStartedExpanded: true,
	customAttachmentFolders: false,
    noteAttachmentFolderLocation: 'obsidian',
	notelessAttachmentFolderLocation: 'obsidian',
	writingSubfolder: 'Ink/Writing',
	drawingSubfolder: 'Ink/Drawing',
	booxConnectionEnabled: false,
	debugLoggingEnabled: false,
	// Writing specific
	writingEnabled: true,
	writingStrokeLimit: 200,
	writingBufferLines: 3,
	writingDynamicStrokeThickness: true,
	writingSmoothing: false,
	writingLinesWhenLocked: true,
	writingBackgroundWhenLocked: true,
	// Drawing specific
	drawingEnabled: true,
	drawingFrameWhenLocked: false,
	drawingBackgroundWhenLocked: false,
}