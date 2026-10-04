/**
 * Vendored from almostuseful-auth `packages/auth-core/src/portal-device-label.ts`.
 * Public Ink cannot file:-depend on the private kit — keep this file in sync manually.
 */

//////////
//////////

/** Matches portal `parse-device-install.ts` — keep in sync across repos. */
export const PORTAL_DEVICE_LABEL_MAX_LENGTH = 80;

export const PORTAL_DEVICE_LABEL_FALLBACK = 'This device';

export interface PortalDeviceLabelHints {
	modelName?: string | null;
	deviceName?: string | null;
	formFactor?: string | null;
	osFamily?: string | null;
}

/** Trim, collapse whitespace, truncate — same rules as the portal parser. */
export function normalizePortalDeviceLabel(raw: string): string {
	const collapsed = raw.trim().replace(/\s+/g, ' ');
	if (!collapsed) return PORTAL_DEVICE_LABEL_FALLBACK;
	if (collapsed.length <= PORTAL_DEVICE_LABEL_MAX_LENGTH) return collapsed;
	return collapsed.slice(0, PORTAL_DEVICE_LABEL_MAX_LENGTH).trim();
}

/**
 * Merge client-supplied hints into one Connected Apps label.
 * Priority: model → user/device name → form factor → OS family → fallback.
 */
export function resolvePortalDeviceLabelFromHints(
	hints: PortalDeviceLabelHints,
): string {
	for (const candidate of [
		hints.modelName,
		hints.deviceName,
		hints.formFactor,
		hints.osFamily,
	]) {
		if (typeof candidate === 'string' && candidate.trim()) {
			return normalizePortalDeviceLabel(candidate);
		}
	}
	return PORTAL_DEVICE_LABEL_FALLBACK;
}

const GENERIC_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

/** Desktop hostname values that should not replace a form-factor label. */
export function isGenericPortalDeviceHostname(hostname: string): boolean {
	const normalized = hostname.trim().toLowerCase();
	return !normalized || GENERIC_HOSTNAMES.has(normalized);
}
