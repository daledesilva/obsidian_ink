/** Editor surface used to scope device-local stroke input behaviour. */
export type StrokeInputEditorKind = 'inkWriting' | 'inkDrawing';

/**
 * User preference: auto-detect from pressure, or override as pen (pressure + pen PF preset)
 * or mouse (simulated pressure + mouse preset).
 */
export type StrokeInputTreatAs = 'auto' | 'pen' | 'mouse';

/** Resolved pen/mouse mode used at capture time (never `'auto'`). */
export type ResolvedStrokeInputTreatAs = Exclude<StrokeInputTreatAs, 'auto'>;

/** Device-local blob stored in `localStorage` (not synced via plugin `data.json`). */
export interface DeviceSettingsV1 {
	/** Ink plugin semver when this blob was last read or written (see `PLUGIN_VERSION`). */
	pluginVersion: string;
	/** Boox / eInk Bridge companion WebSocket (per device, not vault-synced). */
	booxConnectionEnabled: boolean;
	strokeInputTreatAs: Record<StrokeInputEditorKind, StrokeInputTreatAs>;
	/** Last detected input for this device (shared by writing and drawing). */
	lastDetectedStrokeInput: ResolvedStrokeInputTreatAs | null;
}
