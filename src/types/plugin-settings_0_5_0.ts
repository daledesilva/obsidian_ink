////////
////////

// Settings shape introduced in 0.5.0.
// Adds settingsVersion and four new fields that were not in 0.4.0.

import { PluginSettings_0_4_0 } from './plugin-settings_0_4_0';

export interface PluginSettings_0_5_0 extends PluginSettings_0_4_0 {
	settingsVersion: string,
	// General (new in 0.5.0)
	gettingStartedExpanded: boolean,
	booxConnectionEnabled: boolean,
	debugLoggingEnabled: boolean,
	// Writing specific (new in 0.5.0)
	writingBufferLines: number,
}

export const DEFAULT_PLUGIN_SETTINGS_0_5_0: PluginSettings_0_5_0 = {
	settingsVersion: '0.5.0',	// Settings version aligns with the plugin version it was introduced in
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
