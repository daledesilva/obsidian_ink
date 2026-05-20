////////
////////

// Single source of truth: re-exports the current version's types and defaults
// under the canonical names used everywhere in the codebase.
// When a new settings version is introduced, update only this file and the
// versioned settings files — no other imports need to change.

import { DEFAULT_PLUGIN_SETTINGS_0_5_0, PluginSettings_0_5_0 } from './plugin-settings_0_5_0';

///////////////
///////////////

export type PluginSettings = PluginSettings_0_5_0;
export const DEFAULT_SETTINGS = DEFAULT_PLUGIN_SETTINGS_0_5_0;
