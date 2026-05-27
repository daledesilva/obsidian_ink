import { fetchLocally, saveLocally } from 'src/logic/utils/storage';
import { DEFAULT_DEVICE_SETTINGS_V1, DEVICE_SETTINGS_STORAGE_KEY } from './device-settings-defaults';
import type { DeviceSettingsV1, StrokeInputEditorKind, StrokeInputTreatAs } from './device-settings-types';

const DEVICE_SETTINGS_CHANGED_EVENT = 'ddc-ink-device-settings-changed';

function isStrokeInputTreatAs(value: unknown): value is StrokeInputTreatAs {
	return value === 'pen' || value === 'mouse';
}

function isDeviceSettingsV1(value: unknown): value is DeviceSettingsV1 {
	if (!value || typeof value !== 'object') return false;
	const o = value as Record<string, unknown>;
	if (o.version !== 1) return false;
	const treat = o.strokeInputTreatAs;
	if (!treat || typeof treat !== 'object') return false;
	const t = treat as Record<string, unknown>;
	return isStrokeInputTreatAs(t.inkWriting) && isStrokeInputTreatAs(t.inkDrawing);
}

function mergeWithDefaults(partial: unknown): DeviceSettingsV1 {
	const base = DEFAULT_DEVICE_SETTINGS_V1;
	if (!isDeviceSettingsV1(partial)) return { ...base, strokeInputTreatAs: { ...base.strokeInputTreatAs } };
	return {
		version: 1,
		strokeInputTreatAs: {
			inkWriting: partial.strokeInputTreatAs.inkWriting,
			inkDrawing: partial.strokeInputTreatAs.inkDrawing,
		},
	};
}

/** Read merged device settings (never throws; corrupt storage yields defaults). */
export function readDeviceSettings(): DeviceSettingsV1 {
	const raw = fetchLocally(DEVICE_SETTINGS_STORAGE_KEY);
	if (typeof raw !== 'string') return mergeWithDefaults(null);
	try {
		const parsed: unknown = JSON.parse(raw);
		return mergeWithDefaults(parsed);
	} catch {
		return mergeWithDefaults(null);
	}
}

function writeDeviceSettings(settings: DeviceSettingsV1): void {
	saveLocally(DEVICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
	notifyDeviceSettingsChanged();
}

function notifyDeviceSettingsChanged(): void {
	window.dispatchEvent(new CustomEvent(DEVICE_SETTINGS_CHANGED_EVENT));
}

/** Shallow-merge top-level fields into stored settings and persist. */
export function patchDeviceSettings(partial: Partial<DeviceSettingsV1>): DeviceSettingsV1 {
	const current = readDeviceSettings();
	const next: DeviceSettingsV1 = {
		...current,
		...partial,
		strokeInputTreatAs: {
			...current.strokeInputTreatAs,
			...(partial.strokeInputTreatAs ?? {}),
		},
	};
	writeDeviceSettings(next);
	return next;
}

export function getStrokeInputTreatAs(editorKind: StrokeInputEditorKind): StrokeInputTreatAs {
	return readDeviceSettings().strokeInputTreatAs[editorKind];
}

export function setStrokeInputTreatAs(editorKind: StrokeInputEditorKind, value: StrokeInputTreatAs): void {
	patchDeviceSettings({
		strokeInputTreatAs: {
			...readDeviceSettings().strokeInputTreatAs,
			[editorKind]: value,
		},
	});
}

/** Same-tab updates use a custom event; `storage` covers other windows/tabs for the same vault host. */
export function subscribeDeviceSettingsChanged(onChange: () => void): () => void {
	const wrapped = (): void => {
		onChange();
	};
	window.addEventListener(DEVICE_SETTINGS_CHANGED_EVENT, wrapped);
	window.addEventListener('storage', wrapped);
	return () => {
		window.removeEventListener(DEVICE_SETTINGS_CHANGED_EVENT, wrapped);
		window.removeEventListener('storage', wrapped);
	};
}
