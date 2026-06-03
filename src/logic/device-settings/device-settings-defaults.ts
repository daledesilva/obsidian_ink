import { PLUGIN_VERSION } from 'src/constants';
import type { DeviceSettingsV1 } from './device-settings-types';

export const DEVICE_SETTINGS_STORAGE_KEY = 'deviceSettings_v1';

export const DEFAULT_DEVICE_SETTINGS_V1: DeviceSettingsV1 = {
	pluginVersion: PLUGIN_VERSION,
	booxConnectionEnabled: false,
	strokeInputTreatAs: {
		inkWriting: 'auto',
		inkDrawing: 'auto',
	},
	lastDetectedStrokeInput: null,
};
