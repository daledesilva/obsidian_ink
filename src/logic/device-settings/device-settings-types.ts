/** Editor surface used to scope device-local stroke input behaviour. */
export type StrokeInputEditorKind = 'inkWriting' | 'inkDrawing';

/** User override: treat pointer hardware as pen (pressure + pen PF preset) or mouse (simulated pressure + mouse preset). */
export type StrokeInputTreatAs = 'pen' | 'mouse';

/** Versioned blob stored in `localStorage` (not synced via plugin `data.json`). */
export interface DeviceSettingsV1 {
	version: 1;
	strokeInputTreatAs: Record<StrokeInputEditorKind, StrokeInputTreatAs>;
}
