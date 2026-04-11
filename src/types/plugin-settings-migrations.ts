////////
////////

import * as semver from 'semver';
import { PluginSettings_0_4_0, DEFAULT_PLUGIN_SETTINGS_0_4_0 } from './plugin-settings_0_4_0';
import { PluginSettings_0_5_0, DEFAULT_PLUGIN_SETTINGS_0_5_0 } from './plugin-settings_0_5_0';
import { PluginSettings } from './types-map';

///////////
///////////

export function migrateOutdatedSettings(raw: Record<string, unknown>): PluginSettings {
	let updatedSettings: unknown = raw;

	if (!raw.settingsVersion) {
		updatedSettings = migrate_0_4_0_to_0_5_0(raw as unknown as PluginSettings_0_4_0);
	}
	// Add future migrations here as the plugin evolves, e.g.:
	// if (semver.lt(updatedSettings.settingsVersion as string, '0.6.0')) {
	//     updatedSettings = migrate_0_5_0_to_0_6_0(updatedSettings as unknown as PluginSettings_0_5_0);
	// }

	const settingsWereMigrated = JSON.stringify(updatedSettings) !== JSON.stringify(raw);
	if (settingsWereMigrated) {
		console.log('Ink: Migrated outdated plugin settings');
		console.log('Old settings:', JSON.parse(JSON.stringify(raw)));
		console.log('New settings:', JSON.parse(JSON.stringify(updatedSettings)));
	}

	return updatedSettings as unknown as PluginSettings;
}

///////////

export function migrate_0_4_0_to_0_5_0(oldSettings: PluginSettings_0_4_0): PluginSettings_0_5_0 {

	// Some beta/internal builds between 0.4.0 and 0.5.0 saved boox settings under
	// the old key name 'einkBridgeEnabled'. Carry that value forward if present.
	const oldAsAny = oldSettings as unknown as Record<string, unknown>;
	const hadEinkBridgeKey = typeof oldAsAny.einkBridgeEnabled === 'boolean';
	let booxConnectionEnabled: boolean;
	if (hadEinkBridgeKey) {
		booxConnectionEnabled = oldAsAny.einkBridgeEnabled as boolean;
	} else {
		booxConnectionEnabled = DEFAULT_PLUGIN_SETTINGS_0_5_0.booxConnectionEnabled;
	}

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
		booxConnectionEnabled,

		// Always overwrite settingsVersion last
		settingsVersion: DEFAULT_PLUGIN_SETTINGS_0_5_0.settingsVersion,
	};

	return JSON.parse(JSON.stringify(newSettings));
}
