////////
////////

// Re-exports the canonical types from types-map.ts so that all existing
// imports of 'src/types/plugin-settings' continue to work unchanged.

export type { PluginSettings } from './types-map';
export { DEFAULT_SETTINGS } from './types-map';