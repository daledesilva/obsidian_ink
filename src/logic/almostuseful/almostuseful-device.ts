import { Platform } from 'obsidian';

import {
	isGenericPortalDeviceHostname,
	normalizePortalDeviceLabel,
	PORTAL_DEVICE_LABEL_FALLBACK,
	resolvePortalDeviceLabelFromHints,
} from 'src/logic/almostuseful/portal-device-label';
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

/** Label for the portal Connected Apps row — recomputed each login so detection fixes apply on re-auth. */
export function almostUsefulDeviceLabel(): string {
	const userAgent = readUserAgent();

	if (Platform.isIosApp) {
		return resolvePortalDeviceLabelFromHints({
			formFactor: /iPad/i.test(userAgent) ? 'iPad' : 'iPhone',
		});
	}

	// iPadOS desktop mode reports isMacOS before any iOS flag — UA must win over "Mac".
	if (isIpadUserAgent(userAgent)) {
		return resolvePortalDeviceLabelFromHints({ formFactor: 'iPad' });
	}

	if (Platform.isMobileApp) {
		return resolvePortalDeviceLabelFromHints({
			modelName: parseEinkVendorFromUserAgent(userAgent),
			formFactor: resolveAndroidFormFactor(userAgent),
		});
	}

	const hostname = readDesktopHostname();
	if (hostname) {
		return normalizePortalDeviceLabel(hostname);
	}

	if (Platform.isMacOS) {
		return resolvePortalDeviceLabelFromHints({ osFamily: 'Mac' });
	}
	if (Platform.isWin) {
		return resolvePortalDeviceLabelFromHints({ osFamily: 'Windows PC' });
	}
	if (Platform.isLinux) {
		return resolvePortalDeviceLabelFromHints({ osFamily: 'Linux PC' });
	}

	return PORTAL_DEVICE_LABEL_FALLBACK;
}

function readUserAgent(): string {
	if (typeof navigator === 'undefined') return '';
	return navigator.userAgent;
}

function isIpadUserAgent(userAgent: string): boolean {
	if (/iPad/i.test(userAgent)) return true;
	if (!Platform.isMacOS || typeof navigator === 'undefined') return false;
	if (navigator.maxTouchPoints <= 1) return false;
	// iPadOS 13+ reports Macintosh + Mobile in UA (not always MacIntel).
	if (
		/Macintosh/i.test(userAgent) &&
		/Mobile/i.test(userAgent) &&
		!/iPhone/i.test(userAgent)
	) {
		return true;
	}
	return /MacIntel/i.test(userAgent);
}

function parseEinkVendorFromUserAgent(userAgent: string): string | null {
	const boox = userAgent.match(/\b(BOOX(?:\s[\w.]+)+?)(?:\s+Build\b|$)/i);
	if (boox?.[1]) return boox[1].trim();
	const onyx = userAgent.match(/\b(ONYX(?:\s[\w.]+)+?)(?:\s+Build\b|$)/i);
	if (onyx?.[1]) return onyx[1].trim();
	return null;
}

function resolveAndroidFormFactor(userAgent: string): string {
	return /Mobile/i.test(userAgent) ? 'Android phone' : 'Android tablet';
}

function readDesktopHostname(): string | null {
	if (!Platform.isDesktop) return null;
	try {
		// Electron desktop only — mobile Obsidian builds omit Node `os`.
		const os = require('os') as { hostname?: () => string };
		const hostname = os.hostname?.();
		if (typeof hostname !== 'string') return null;
		if (isGenericPortalDeviceHostname(hostname)) return null;
		return hostname;
	} catch {
		return null;
	}
}

/** 32 hex characters. Unguessable, and not a constant in source. */
function mintAlmostUsefulDeviceId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
