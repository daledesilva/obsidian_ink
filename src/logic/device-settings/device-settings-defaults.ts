import type { DeviceSettingsV1 } from './device-settings-types';

export const DEVICE_SETTINGS_STORAGE_KEY = 'deviceSettings_v1';

export const DEFAULT_DEVICE_SETTINGS_V1: DeviceSettingsV1 = {
	version: 1,
	strokeInputTreatAs: {
		inkWriting: 'pen',
		inkDrawing: 'pen',
	},
};
