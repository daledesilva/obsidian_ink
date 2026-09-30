import { Platform } from 'obsidian';

import { ALMOSTUSEFUL_DEVICE_STORAGE_SUFFIX } from 'src/logic/almostuseful/almostuseful-constants';
import { fetchLocally, saveLocally } from 'src/logic/utils/storage';

/////////
/////////

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export interface AlmostUsefulDeviceInstall {
	deviceId: string;
	deviceLabel: string;
}

/** Stable random id for this install, created once and kept in device-local storage. */
export function readOrCreateAlmostUsefulDeviceInstall(): AlmostUsefulDeviceInstall {
	const existing = fetchLocally(ALMOSTUSEFUL_DEVICE_STORAGE_SUFFIX);
	if (typeof existing === 'string' && DEVICE_ID_PATTERN.test(existing)) {
		return { deviceId: existing, deviceLabel: almostUsefulDeviceLabel() };
	}
	const deviceId = mintAlmostUsefulDeviceId();
	saveLocally(ALMOSTUSEFUL_DEVICE_STORAGE_SUFFIX, deviceId);
	return { deviceId, deviceLabel: almostUsefulDeviceLabel() };
}

/** Short label for the portal Connected apps row. Not a secret. */
export function almostUsefulDeviceLabel(): string {
	if (Platform.isMacOS) return 'Mac';
	if (Platform.isWin) return 'Windows';
	if (Platform.isLinux) return 'Linux';
	if (Platform.isIosApp) return 'iPhone';
	if (Platform.isMobileApp) return 'Android';
	return 'This device';
}

/** 32 hex characters. Unguessable, and not a constant in source. */
function mintAlmostUsefulDeviceId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
