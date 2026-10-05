/**
 * Vendored from almostuseful-auth `packages/auth-core/src/portal-device-label.ts`.
 * Public Ink cannot file:-depend on the private kit — keep this file in sync manually.
 */

//////////
//////////

/** Matches portal `parse-device-install.ts` — keep in sync across repos. */
export const PORTAL_DEVICE_LABEL_MAX_LENGTH = 80;

export const PORTAL_DEVICE_LABEL_FALLBACK = 'Unlabelled Device';

export interface PortalDeviceLabelHints {
	modelName?: string | null;
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
 * Merge hardware hints into one Connected Apps label.
 * Priority: model → form factor → OS family → Unlabelled Device.
 * A user-assigned name is omitted on purpose: it often contains a personal name.
 */
export function resolvePortalDeviceLabelFromHints(
	hints: PortalDeviceLabelHints,
): string {
	for (const candidate of [hints.modelName, hints.formFactor, hints.osFamily]) {
		if (typeof candidate === 'string' && candidate.trim()) {
			return normalizePortalDeviceLabel(candidate);
		}
	}
	return PORTAL_DEVICE_LABEL_FALLBACK;
}

/**
 * Product line from an Apple hardware identifier (`MacBookPro18,2`).
 * Apple silicon ids (`Mac15,3`) do not encode the line and return null.
 */
export function appleHardwareMarketingName(modelIdentifier: string): string | null {
	const identifier = modelIdentifier.trim();
	if (!identifier) return null;
	if (/^MacBookPro/i.test(identifier)) return 'MacBook Pro';
	if (/^MacBookAir/i.test(identifier)) return 'MacBook Air';
	if (/^MacBook/i.test(identifier)) return 'MacBook';
	if (/^Macmini/i.test(identifier)) return 'Mac mini';
	if (/^MacPro/i.test(identifier)) return 'Mac Pro';
	if (/^MacStudio/i.test(identifier)) return 'Mac Studio';
	if (/^iMac/i.test(identifier)) return 'iMac';
	return null;
}
