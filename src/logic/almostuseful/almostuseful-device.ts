import { Platform } from 'obsidian';

import {
	appleHardwareMarketingName,
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

	// iPadOS desktop mode reports isMacOS — UA must win over a Mac product line.
	if (isIpadUserAgent(userAgent)) {
		return resolvePortalDeviceLabelFromHints({ formFactor: 'iPad' });
	}

	if (Platform.isMobileApp) {
		return resolvePortalDeviceLabelFromHints({
			modelName: parseEinkVendorFromUserAgent(userAgent),
			formFactor: resolveAndroidFormFactor(userAgent),
		});
	}

	// Computer and Bonjour names often include a person's name. Use the product line.
	if (Platform.isMacOS) {
		const productLine = readMacProductLine();
		if (productLine) return normalizePortalDeviceLabel(productLine);
		return PORTAL_DEVICE_LABEL_FALLBACK;
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

interface HardwareProbe {
	execFileSync: (
		file: string,
		args: string[],
		options: { encoding: 'utf8'; timeout: number },
	) => string;
}

/** Mac product line such as MacBook Pro. Never a hostname. */
function readMacProductLine(): string | null {
	if (!Platform.isDesktop || !Platform.isMacOS) return null;
	const fromIdentifier = readAppleModelIdentifier();
	if (fromIdentifier) return fromIdentifier;
	return readSystemProfilerModelName();
}

/** `sysctl hw.model` covers Intel-style ids (`MacBookPro18,2`) without a slow profiler call. */
function readAppleModelIdentifier(): string | null {
	const identifier = readHardwareProbe('/usr/sbin/sysctl', ['-n', 'hw.model'], 1500);
	if (!identifier) return null;
	return appleHardwareMarketingName(identifier);
}

/** Apple silicon ids (`Mac15,3`) need Model Name from system_profiler. */
function readSystemProfilerModelName(): string | null {
	const profile = readHardwareProbe('/usr/sbin/system_profiler', ['SPHardwareDataType'], 5000);
	if (!profile) return null;
	const modelName = profile.match(/^\s*Model Name:\s*(.+)$/m)?.[1]?.trim() ?? '';
	const productLine = modelName.replace(/\s*\([^)]*\)\s*$/, '').trim();
	if (!productLine) return null;
	return productLine;
}

function readHardwareProbe(file: string, args: string[], timeout: number): string | null {
	try {
		const childProcess = require('child_process') as HardwareProbe;
		const output = childProcess.execFileSync(file, args, { encoding: 'utf8', timeout });
		if (typeof output !== 'string') return null;
		const trimmed = output.trim();
		if (!trimmed) return null;
		return trimmed;
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
