////////
////////

// Settings shape introduced in 0.5.0.
// Adds settingsVersion and four new fields that were not in 0.4.0.

import { PluginSettings_0_4_0 } from './plugin-settings_0_4_0';

export type DominantHand = 'left' | 'right';

export interface PluginSettings_0_5_0 extends PluginSettings_0_4_0 {
	settingsVersion: string,
	// General (new in 0.5.0)
	gettingStartedExpanded: boolean,
	debugLoggingEnabled: boolean,
	dominantHand: DominantHand,
	// Writing specific (new in 0.5.0)
	writingBufferLines: number,
	writingLineHeight: number,
	/** Auto-enqueue handwriting transcription when a writing embed locks or dedicated view closes. */
	writingAutoTranscribeOnClose: boolean,
	// Drawing specific (new in 0.5.0)
	drawingGridEnabledByDefault: boolean,
	/** Auto-enqueue handwriting transcription when a drawing embed locks or dedicated view closes. */
	drawingAutoTranscribeOnClose: boolean,
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
	debugLoggingEnabled: false,
	dominantHand: 'right',
	// Writing specific
	writingEnabled: true,
	writingStrokeLimit: 200,
	writingBufferLines: 3,
	writingLineHeight: 150,
	writingDynamicStrokeThickness: true,
	writingSmoothing: false,
	writingLinesWhenLocked: true,
	writingBackgroundWhenLocked: true,
	writingAutoTranscribeOnClose: true,
	// Drawing specific
	drawingEnabled: true,
	drawingGridEnabledByDefault: true,
	drawingAutoTranscribeOnClose: false,
	drawingFrameWhenLocked: false,
	drawingBackgroundWhenLocked: false,
}
