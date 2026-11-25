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

interface NavigatorUserAgentData {
	getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
}

/** Stable random id for this install, created once and kept in device-local storage. */
export async function readOrCreateAlmostUsefulDeviceInstall(): Promise<AlmostUsefulDeviceInstall> {
	const existing = fetchLocally(ALMOSTUSEFUL_DEVICE_STORAGE_SUFFIX);
	if (typeof existing === 'string' && DEVICE_ID_PATTERN.test(existing)) {
		return { deviceId: existing, deviceLabel: await almostUsefulDeviceLabel() };
	}
	const deviceId = mintAlmostUsefulDeviceId();
	saveLocally(ALMOSTUSEFUL_DEVICE_STORAGE_SUFFIX, deviceId);
	return { deviceId, deviceLabel: await almostUsefulDeviceLabel() };
}

/** Label for the portal Connected Apps row — recomputed each login so detection fixes apply on re-auth. */
export async function almostUsefulDeviceLabel(): Promise<string> {
	if (Platform.isIosApp) {
		return resolvePortalDeviceLabelFromHints({
			formFactor: Platform.isTablet ? 'iPad' : 'iPhone',
		});
	}

	if (Platform.isAndroidApp || Platform.isMobileApp) {
		const modelName = await readClientHintsModel();
		return resolvePortalDeviceLabelFromHints({
			modelName,
			formFactor: Platform.isPhone ? 'Android phone' : 'Android tablet',
		});
	}

	// Computer and Bonjour names often include a person's name. Use the product line.
	if (Platform.isMacOS) {
		const productLine = await readMacProductLine();
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

/**
 * Reads the hardware model from User-Agent Client Hints (Chromium / Android WebView 90+).
 * Returns null when unsupported (e.g. Safari/WebKit) or empty.
 */
async function readClientHintsModel(): Promise<string | null> {
	if (typeof navigator === 'undefined') return null;
	const uaData = (navigator as Navigator & { userAgentData?: NavigatorUserAgentData })
		.userAgentData;
	if (!uaData || typeof uaData.getHighEntropyValues !== 'function') return null;
	try {
		const hints = await uaData.getHighEntropyValues(['model']);
		const model = typeof hints?.model === 'string' ? hints.model.trim() : '';
		return model || null;
	} catch {
		return null;
	}
}

/** Mac product line such as MacBook Pro. Never a hostname. */
async function readMacProductLine(): Promise<string | null> {
	if (!Platform.isDesktop || !Platform.isMacOS) return null;
	const fromIdentifier = await readAppleModelIdentifier();
	if (fromIdentifier) return fromIdentifier;
	return readSystemProfilerModelName();
}

/** `sysctl hw.model` covers Intel-style ids (`MacBookPro18,2`) without a slow profiler call. */
async function readAppleModelIdentifier(): Promise<string | null> {
	const identifier = await readHardwareProbe('/usr/sbin/sysctl', ['-n', 'hw.model'], 1500);
	if (!identifier) return null;
	return appleHardwareMarketingName(identifier);
}

/** Apple silicon ids (`Mac15,3`) need Model Name from system_profiler. */
async function readSystemProfilerModelName(): Promise<string | null> {
	const profile = await readHardwareProbe('/usr/sbin/system_profiler', ['SPHardwareDataType'], 5000);
	if (!profile) return null;
	const modelName = profile.match(/^\s*Model Name:\s*(.+)$/m)?.[1]?.trim() ?? '';
	const productLine = modelName.replace(/\s*\([^)]*\)\s*$/, '').trim();
	if (!productLine) return null;
	return productLine;
}

async function readHardwareProbe(
	file: string,
	args: string[],
	timeout: number,
): Promise<string | null> {
	if (!Platform.isDesktop) return null;
	try {
		const childProcess = await import('child_process');
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
