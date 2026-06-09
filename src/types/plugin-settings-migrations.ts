////////
////////

import { PluginSettings_0_4_0 } from './plugin-settings_0_4_0';
import { PluginSettings_0_5_0, DEFAULT_PLUGIN_SETTINGS_0_5_0 } from './plugin-settings_0_5_0';
import { PluginSettings } from './types-map';

///////////
///////////

export function migrateOutdatedSettings(raw: Record<string, unknown>): PluginSettings {
	let updatedSettings: unknown = raw;

	if (!raw.settingsVersion) {
		updatedSettings = migrate_0_4_0_to_0_5_0(raw as unknown as PluginSettings_0_4_0);
	}

	const settings = updatedSettings as PluginSettings;

	// Additive field on 0.5.0 — default for vaults saved before dominantHand existed
	if (settings.dominantHand === undefined) {
		settings.dominantHand = DEFAULT_PLUGIN_SETTINGS_0_5_0.dominantHand;
	}

	// Additive field on 0.5.0 — default for vaults saved before drawingGridEnabledByDefault existed
	if (settings.drawingGridEnabledByDefault === undefined) {
		settings.drawingGridEnabledByDefault = DEFAULT_PLUGIN_SETTINGS_0_5_0.drawingGridEnabledByDefault;
	}

	// Undo mistaken 0.6.0 settingsVersion bump from an earlier build
	if (settings.settingsVersion === '0.6.0') {
		settings.settingsVersion = DEFAULT_PLUGIN_SETTINGS_0_5_0.settingsVersion;
	}

	const settingsWereMigrated = JSON.stringify(updatedSettings) !== JSON.stringify(raw);
	if (settingsWereMigrated) {
		console.debug('Ink: Migrated outdated plugin settings');
		console.debug('Old settings:', JSON.parse(JSON.stringify(raw)));
		console.debug('New settings:', JSON.parse(JSON.stringify(updatedSettings)));
	}

	return settings;
}

///////////

export function migrate_0_4_0_to_0_5_0(oldSettings: PluginSettings_0_4_0): PluginSettings_0_5_0 {

	const newSettings: PluginSettings_0_5_0 = {

		// Apply defaults as a safety net for any gap
		...DEFAULT_PLUGIN_SETTINGS_0_5_0,

		// Transfer all existing user settings
		...oldSettings,

		// Migrate & overwrite exceptions
		/////////////////////////////////////

		// New fields — use defaults since they didn't exist in 0.4.0
		gettingStartedExpanded: DEFAULT_PLUGIN_SETTINGS_0_5_0.gettingStartedExpanded,
		writingBufferLines: DEFAULT_PLUGIN_SETTINGS_0_5_0.writingBufferLines,
		debugLoggingEnabled: DEFAULT_PLUGIN_SETTINGS_0_5_0.debugLoggingEnabled,
		dominantHand: DEFAULT_PLUGIN_SETTINGS_0_5_0.dominantHand,

		// Always overwrite settingsVersion last
		settingsVersion: DEFAULT_PLUGIN_SETTINGS_0_5_0.settingsVersion,
	};

	return JSON.parse(JSON.stringify(newSettings)) as PluginSettings_0_5_0;
}
