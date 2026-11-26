import { fetchLocally, saveLocally } from 'src/logic/utils/storage';
import type { InkStrokeStyle } from 'src/ink-canvas/types';

/** Capture-only overrides. Never applied when rendering existing strokes. */
export interface HandwritingExperiments {
	version: 1;
	enabled: boolean;
	fixedWidth: boolean;
	fixedWidthSize: number;
	pressureEnabled: boolean;
	pressureProcessing: boolean;
	positionStabilization: boolean;
	thinning: number;
	mergePoints: boolean;
	overrideSmoothing: boolean;
	streamline: number;
	smoothing: number;
}

const LEGACY_HANDWRITING_EXPERIMENTS: Readonly<HandwritingExperiments> = {
	version: 1,
	enabled: false,
	fixedWidth: false,
	fixedWidthSize: 4,
	pressureEnabled: true,
	pressureProcessing: true,
	positionStabilization: false,
	thinning: 0.6,
	mergePoints: true,
	overrideSmoothing: false,
	streamline: 0,
	smoothing: 0.1,
};

/** One-click, device-local presets. Apple Notes is a feel preset, not Apple's native engine. */
export const HANDWRITING_PRESETS: Record<'appleNotes' | 'balanced' | 'excalidraw' | 'deprecated', Readonly<HandwritingExperiments>> = {
	appleNotes: {
		...LEGACY_HANDWRITING_EXPERIMENTS, enabled: true, pressureProcessing: false,
		positionStabilization: true, thinning: 0.35,
		overrideSmoothing: true, streamline: 0.4, smoothing: 0.5,
	},
	balanced: {
		...LEGACY_HANDWRITING_EXPERIMENTS, enabled: true, pressureProcessing: false,
		positionStabilization: true, thinning: 0.48,
		overrideSmoothing: true, streamline: 0.45, smoothing: 0.5,
	},
	excalidraw: {
		...LEGACY_HANDWRITING_EXPERIMENTS, enabled: true, pressureProcessing: false,
		overrideSmoothing: true, streamline: 0.5, smoothing: 0.5,
	},
	// Disabling overrides restores the original input and brush pipeline for comparison.
	deprecated: { ...LEGACY_HANDWRITING_EXPERIMENTS },
};

export const DEFAULT_HANDWRITING_EXPERIMENTS: Readonly<HandwritingExperiments> = HANDWRITING_PRESETS.balanced;

const STORAGE_KEY = 'handwritingExperiments_v1';
export const HANDWRITING_EXPERIMENTS_CHANGED = 'ink-handwriting-experiments-changed';

export function sanitizeHandwritingExperiments(raw: unknown): HandwritingExperiments {
	if (!raw || typeof raw !== 'object' || (raw as Record<string, unknown>).version !== 1) {
		return { ...DEFAULT_HANDWRITING_EXPERIMENTS };
	}
	// Existing v1 blobs keep their old fallback values, including missing opt-in fields.
	const settings = { ...LEGACY_HANDWRITING_EXPERIMENTS };
	const value = raw as Record<string, unknown>;
	for (const key of ['enabled', 'fixedWidth', 'pressureEnabled', 'pressureProcessing', 'positionStabilization', 'mergePoints', 'overrideSmoothing'] as const) {
		if (typeof value[key] === 'boolean') settings[key] = value[key];
	}
	for (const key of ['fixedWidthSize', 'streamline', 'smoothing', 'thinning'] as const) {
		const n = value[key];
		if (typeof n === 'number' && Number.isFinite(n)) {
			settings[key] = Math.max(key === 'fixedWidthSize' ? 0.5 : 0, Math.min(key === 'fixedWidthSize' ? 20 : 1, n));
		}
	}
	return settings;
}

/** Read once on pointerdown; no storage reads on the move/render hot paths. */
export function readHandwritingExperiments(): HandwritingExperiments {
	try {
		const raw = fetchLocally(STORAGE_KEY);
		return sanitizeHandwritingExperiments(typeof raw === 'string' ? JSON.parse(raw) : null);
	} catch {
		return { ...DEFAULT_HANDWRITING_EXPERIMENTS };
	}
}

export function patchHandwritingExperiments(patch: Partial<HandwritingExperiments>): void {
	const settings = sanitizeHandwritingExperiments({ ...readHandwritingExperiments(), ...patch });
	saveLocally(STORAGE_KEY, JSON.stringify(settings));
	window.dispatchEvent(new CustomEvent(HANDWRITING_EXPERIMENTS_CHANGED));
}

/** Values are absolute PF values, after the ordinary preset's capture-zoom adjustment. */
export function applyHandwritingExperiments(style: InkStrokeStyle, settings: HandwritingExperiments): InkStrokeStyle {
	if (!settings.enabled) return style;
	return {
		...style,
		thinning: settings.thinning,
		...(settings.overrideSmoothing ? { streamline: settings.streamline, smoothing: settings.smoothing } : {}),
		...(!settings.pressureEnabled || settings.fixedWidth ? { thinning: 0, simulatePressure: false } : {}),
		...(settings.fixedWidth ? { size: settings.fixedWidthSize } : {}),
	};
}
