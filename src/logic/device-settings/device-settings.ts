import { PLUGIN_VERSION } from 'src/constants';
import { fetchLocally, saveLocally } from 'src/logic/utils/storage';
import { DEFAULT_DEVICE_SETTINGS_V1, DEVICE_SETTINGS_STORAGE_KEY } from './device-settings-defaults';
import type {
	DeviceSettingsV1,
	LowCreditNoticeState,
	ResolvedStrokeInputTreatAs,
	StrokeInputEditorKind,
	StrokeInputTreatAs,
} from './device-settings-types';

const DEVICE_SETTINGS_CHANGED_EVENT = 'ddc-ink-device-settings-changed';

function isStrokeInputTreatAs(value: unknown): value is StrokeInputTreatAs {
	return value === 'auto' || value === 'pen' || value === 'mouse';
}

function isResolvedStrokeInputTreatAs(value: unknown): value is ResolvedStrokeInputTreatAs {
	return value === 'pen' || value === 'mouse';
}

function isLastDetectedStrokeInput(value: unknown): value is DeviceSettingsV1['lastDetectedStrokeInput'] {
	return value === null || isResolvedStrokeInputTreatAs(value);
}

function isDeviceSettingsV1(value: unknown): value is DeviceSettingsV1 {
	if (!value || typeof value !== 'object') return false;
	const o = value as Record<string, unknown>;
	if (typeof o.pluginVersion !== 'string') return false;
	const treat = o.strokeInputTreatAs;
	if (!treat || typeof treat !== 'object') return false;
	const t = treat as Record<string, unknown>;
	return isStrokeInputTreatAs(t.inkWriting) && isStrokeInputTreatAs(t.inkDrawing);
}

function mergeWithDefaults(partial: unknown): DeviceSettingsV1 {
	const base = DEFAULT_DEVICE_SETTINGS_V1;
	if (!isDeviceSettingsV1(partial)) {
		return {
			...base,
			strokeInputTreatAs: { ...base.strokeInputTreatAs },
			lastDetectedStrokeInput: base.lastDetectedStrokeInput,
		};
	}
	const lastDetected = isLastDetectedStrokeInput(partial.lastDetectedStrokeInput)
		? partial.lastDetectedStrokeInput
		: base.lastDetectedStrokeInput;
	const booxConnectionEnabled =
		typeof partial.booxConnectionEnabled === 'boolean'
			? partial.booxConnectionEnabled
			: base.booxConnectionEnabled;
	const legacyPartial = partial as DeviceSettingsV1 & {
		styleForGrayscaleScreenEnabled?: boolean;
		highContrastStyling?: boolean;
	};
	const hasStoredHighContrastUserInterface =
		'highContrastUserInterface' in partial
		|| 'highContrastStyling' in partial
		|| 'styleForGrayscaleScreenEnabled' in partial;
	let highContrastUserInterface = base.highContrastUserInterface;
	if (typeof partial.highContrastUserInterface === 'boolean') {
		highContrastUserInterface = partial.highContrastUserInterface;
	} else if (typeof legacyPartial.highContrastStyling === 'boolean') {
		highContrastUserInterface = legacyPartial.highContrastStyling;
	} else if (typeof legacyPartial.styleForGrayscaleScreenEnabled === 'boolean') {
		highContrastUserInterface = legacyPartial.styleForGrayscaleScreenEnabled;
	} else if (!hasStoredHighContrastUserInterface && booxConnectionEnabled) {
		// Existing Boox users before this field existed kept high-contrast chrome tied to Boox.
		highContrastUserInterface = true;
	}
	const fingerDrawingEnabled =
		typeof partial.fingerDrawingEnabled === 'boolean'
			? partial.fingerDrawingEnabled
			: base.fingerDrawingEnabled;
	const stylusSideButtonTemporaryErase =
		typeof partial.stylusSideButtonTemporaryErase === 'boolean'
			? partial.stylusSideButtonTemporaryErase
			: base.stylusSideButtonTemporaryErase;
	const inkCloseCount =
		typeof partial.inkCloseCount === 'number' && partial.inkCloseCount >= 0
			? partial.inkCloseCount
			: base.inkCloseCount;
	const autoTranscribeAccountNoticeDismissed =
		typeof partial.autoTranscribeAccountNoticeDismissed === 'boolean'
			? partial.autoTranscribeAccountNoticeDismissed
			: base.autoTranscribeAccountNoticeDismissed;
	const lowCreditNoticeState = mergeLowCreditNoticeState(partial.lowCreditNoticeState);
	return {
		pluginVersion: PLUGIN_VERSION,
		booxConnectionEnabled,
		highContrastUserInterface,
		fingerDrawingEnabled,
		stylusSideButtonTemporaryErase,
		strokeInputTreatAs: {
			inkWriting: partial.strokeInputTreatAs.inkWriting,
			inkDrawing: partial.strokeInputTreatAs.inkDrawing,
		},
		lastDetectedStrokeInput: lastDetected,
		inkCloseCount,
		autoTranscribeAccountNoticeDismissed,
		lowCreditNoticeState,
	};
}

/**
 * Keeps stored low-credit warnings when the blob predates the field.
 *
 * Blobs written before this field existed must not lose the rest of their settings, and a
 * malformed entry must fall back to "nothing shown yet" rather than suppressing warnings.
 */
function mergeLowCreditNoticeState(raw: unknown): LowCreditNoticeState {
	const base = DEFAULT_DEVICE_SETTINGS_V1.lowCreditNoticeState;
	if (!raw || typeof raw !== 'object') return { ...base, shownThresholdsPercent: [] };
	const record = raw as Record<string, unknown>;
	const shownThresholds = Array.isArray(record.shownThresholdsPercent)
		? record.shownThresholdsPercent.filter(
			(value): value is number => typeof value === 'number' && Number.isFinite(value),
		)
		: [];
	return {
		userId: typeof record.userId === 'string' ? record.userId : base.userId,
		periodKey: typeof record.periodKey === 'string' ? record.periodKey : base.periodKey,
		shownThresholdsPercent: shownThresholds,
	};
}

function shouldPersistPluginVersion(stored: unknown): boolean {
	if (!stored || typeof stored !== 'object') return false;
	return (stored as Record<string, unknown>).pluginVersion !== PLUGIN_VERSION;
}

/** Read merged device settings (never throws; corrupt storage yields defaults). */
export function readDeviceSettings(): DeviceSettingsV1 {
	const raw = fetchLocally(DEVICE_SETTINGS_STORAGE_KEY);
	if (typeof raw !== 'string') return mergeWithDefaults(null);
	try {
		const parsed: unknown = JSON.parse(raw);
		const merged = mergeWithDefaults(parsed);
		if (shouldPersistPluginVersion(parsed)) {
			writeDeviceSettings(merged);
		}
		return merged;
	} catch {
		return mergeWithDefaults(null);
	}
}

function writeDeviceSettings(settings: DeviceSettingsV1): void {
	const toStore: DeviceSettingsV1 = {
		...settings,
		pluginVersion: PLUGIN_VERSION,
	};
	saveLocally(DEVICE_SETTINGS_STORAGE_KEY, JSON.stringify(toStore));
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
		lastDetectedStrokeInput:
			partial.lastDetectedStrokeInput === undefined
				? current.lastDetectedStrokeInput
				: partial.lastDetectedStrokeInput,
	};
	writeDeviceSettings(next);
	return next;
}

export function getBooxConnectionEnabled(): boolean {
	return readDeviceSettings().booxConnectionEnabled;
}

export function setBooxConnectionEnabled(enabled: boolean): void {
	patchDeviceSettings({ booxConnectionEnabled: enabled });
}

export function getHighContrastUserInterface(): boolean {
	return readDeviceSettings().highContrastUserInterface;
}

export function setHighContrastUserInterface(enabled: boolean): void {
	patchDeviceSettings({ highContrastUserInterface: enabled });
}

/** Resets Boox companion to default (off). Used by vault "Reset settings". */
export function resetBooxConnectionToDefault(): void {
	setBooxConnectionEnabled(DEFAULT_DEVICE_SETTINGS_V1.booxConnectionEnabled);
}

export function getFingerDrawingEnabled(): boolean {
	return readDeviceSettings().fingerDrawingEnabled;
}

export function setFingerDrawingEnabled(enabled: boolean): void {
	patchDeviceSettings({ fingerDrawingEnabled: enabled });
}

/** Resets finger drawing to default (off). Used by vault "Reset settings". */
export function resetFingerDrawingToDefault(): void {
	setFingerDrawingEnabled(DEFAULT_DEVICE_SETTINGS_V1.fingerDrawingEnabled);
}

export function getStylusSideButtonTemporaryEraseEnabled(): boolean {
	return readDeviceSettings().stylusSideButtonTemporaryErase;
}

export function setStylusSideButtonTemporaryEraseEnabled(enabled: boolean): void {
	patchDeviceSettings({ stylusSideButtonTemporaryErase: enabled });
}

/** Resets experimental stylus side-button flag to default (off). Used by vault "Reset settings". */
export function resetExperimentalDeviceSettingsToDefault(): void {
	patchDeviceSettings({
		stylusSideButtonTemporaryErase: DEFAULT_DEVICE_SETTINGS_V1.stylusSideButtonTemporaryErase,
		highContrastUserInterface: DEFAULT_DEVICE_SETTINGS_V1.highContrastUserInterface,
	});
}

/**
 * One-time import from vault `data.json` keys (`booxConnectionEnabled` / legacy `einkBridgeEnabled`).
 * @returns Whether a vault value was applied to device storage.
 */
function deviceStorageAlreadyHasBooxField(): boolean {
	const raw = fetchLocally(DEVICE_SETTINGS_STORAGE_KEY);
	if (typeof raw !== 'string') return false;
	try {
		const parsed: unknown = JSON.parse(raw);
		return !!parsed && typeof parsed === 'object' && 'booxConnectionEnabled' in parsed;
	} catch {
		return false;
	}
}

export function migrateBooxConnectionFromVaultToDevice(
	vaultPluginData: Record<string, unknown> | null,
): boolean {
	if (!vaultPluginData || deviceStorageAlreadyHasBooxField()) return false;
	let vaultValue: boolean | undefined;
	if (typeof vaultPluginData.booxConnectionEnabled === 'boolean') {
		vaultValue = vaultPluginData.booxConnectionEnabled;
	} else if (typeof vaultPluginData.einkBridgeEnabled === 'boolean') {
		vaultValue = vaultPluginData.einkBridgeEnabled;
	}
	if (vaultValue === undefined) return false;
	setBooxConnectionEnabled(vaultValue);
	return true;
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

export function getLastDetectedStrokeInput(
): ResolvedStrokeInputTreatAs | null {
	return readDeviceSettings().lastDetectedStrokeInput;
}

export function setLastDetectedStrokeInput(
	value: ResolvedStrokeInputTreatAs,
): void {
	patchDeviceSettings({
		lastDetectedStrokeInput: value,
	});
}

export function resolveStrokeInputTreatAs(
	preference: StrokeInputTreatAs,
	lastDetected: ResolvedStrokeInputTreatAs | null,
): ResolvedStrokeInputTreatAs {
	if (preference === 'pen') return 'pen';
	if (preference === 'mouse') return 'mouse';
	return lastDetected ?? 'mouse';
}

/** Saved ink closes before the auto-transcribe account notice is shown (embed lock or dedicated view close). */
export const AUTO_TRANSCRIBE_ACCOUNT_NOTICE_INK_CLOSE_THRESHOLD = 20;

export function incrementInkCloseCount(): number {
	const nextCount = readDeviceSettings().inkCloseCount + 1;
	patchDeviceSettings({ inkCloseCount: nextCount });
	return nextCount;
}

export function isAutoTranscribeAccountNoticeDismissed(): boolean {
	return readDeviceSettings().autoTranscribeAccountNoticeDismissed;
}

export function markAutoTranscribeAccountNoticeDismissed(): void {
	patchDeviceSettings({ autoTranscribeAccountNoticeDismissed: true });
}

export function readLowCreditNoticeState(): LowCreditNoticeState {
	return readDeviceSettings().lowCreditNoticeState;
}

/**
 * Records that a low-credit warning has been shown, resetting when the user or period changes.
 *
 * Matching on both user and period means a new linked account or a refilled pool starts
 * clean, while the same period never repeats a threshold it already warned about.
 */
export function markLowCreditThresholdShown(params: {
	userId: string;
	periodKey: string;
	thresholdPercent: number;
}): LowCreditNoticeState {
	const current = readLowCreditNoticeState();
	const isSamePeriod =
		current.userId === params.userId && current.periodKey === params.periodKey;
	const shownThresholds = isSamePeriod ? [...current.shownThresholdsPercent] : [];
	if (!shownThresholds.includes(params.thresholdPercent)) {
		shownThresholds.push(params.thresholdPercent);
	}
	const next: LowCreditNoticeState = {
		userId: params.userId,
		periodKey: params.periodKey,
		shownThresholdsPercent: shownThresholds,
	};
	patchDeviceSettings({ lowCreditNoticeState: next });
	return next;
}

/** True when this threshold has already warned for this user in this period. */
export function hasLowCreditThresholdBeenShown(params: {
	userId: string;
	periodKey: string;
	thresholdPercent: number;
}): boolean {
	const current = readLowCreditNoticeState();
	const isSamePeriod =
		current.userId === params.userId && current.periodKey === params.periodKey;
	if (!isSamePeriod) return false;
	return current.shownThresholdsPercent.includes(params.thresholdPercent);
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
