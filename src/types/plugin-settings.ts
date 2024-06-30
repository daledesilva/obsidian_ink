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
	customAttachmentFolders: boolean,
    noteAttachmentFolderLocation: 'obsidian' | 'root' | 'note',
    notelessAttachmentFolderLocation: 'obsidian' | 'root',
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
		lastVersionTipRead: '',
	},
	// General
	customAttachmentFolders: false,
    noteAttachmentFolderLocation: 'obsidian',
	notelessAttachmentFolderLocation: 'obsidian',
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