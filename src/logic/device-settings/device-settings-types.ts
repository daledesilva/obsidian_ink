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
	/** High-contrast Ink chrome for e-ink / grayscale displays (per device, not vault-synced). */
	highContrastUserInterface: boolean;
	/** When true, editors show a toolbar toggle to draw with a finger on touch devices. */
	fingerDrawingEnabled: boolean;
	strokeInputTreatAs: Record<StrokeInputEditorKind, StrokeInputTreatAs>;
	/** Last detected input for this device (shared by writing and drawing). */
	lastDetectedStrokeInput: ResolvedStrokeInputTreatAs | null;
	/** Experimental: pen barrel button temporarily erases instead of panning. */
	stylusSideButtonTemporaryErase: boolean;
	/** Saved embed locks and dedicated view closes on this device (auto-transcribe account notice). */
	inkCloseCount: number;
	/** User dismissed or opened settings from the auto-transcribe account notice. */
	autoTranscribeAccountNoticeDismissed: boolean;
	/**
	 * Low-credit thresholds already warned for, per billing period and user.
	 *
	 * Device-local like the rest of this blob: the warning is about this device's credits
	 * and must not sync, and the period key lets it reset naturally when the pool refills.
	 */
	lowCreditNoticeState: LowCreditNoticeState;
}

/** One period's worth of already-shown low-credit warnings. */
export interface LowCreditNoticeState {
	/** Account the warnings belong to; a different linked account starts clean. */
	userId: string;
	/** Billing period the warnings belong to, so a new period warns again. */
	periodKey: string;
	/** Thresholds (percent remaining) already shown in this period. */
	shownThresholdsPercent: number[];
}
