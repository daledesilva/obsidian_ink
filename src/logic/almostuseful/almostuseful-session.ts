import {
	ALMOSTUSEFUL_APP_TOKEN_TYPE,
	ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
	ALMOSTUSEFUL_CLIENT_ID,
	ALMOSTUSEFUL_DEBUG_STORAGE_SUFFIX,
	ALMOSTUSEFUL_DEFAULT_CUSTOM_PORTAL_ORIGIN,
	ALMOSTUSEFUL_HANDOFF_STORAGE_SUFFIX,
	ALMOSTUSEFUL_PORTAL_ORIGIN,
	ALMOSTUSEFUL_SESSION_CHANGED_EVENT,
	ALMOSTUSEFUL_SESSION_STORAGE_SUFFIX,
} from 'src/logic/almostuseful/almostuseful-constants';
import { isInkDevelopmentBuild } from 'src/logic/utils/ink-build-mode';
import { deleteLocally, fetchLocally, saveLocally } from 'src/logic/utils/storage';

/////////
/////////

export interface AlmostUsefulSession {
	tokenType: typeof ALMOSTUSEFUL_APP_TOKEN_TYPE;
	accessToken: string;
	refreshToken: string;
	expiresAtEpochSeconds: number;
	grantId: string;
	userId: string;
	clientId: string;
	displayName: string;
	userEmail: string | null;
}

export type AlmostUsefulPortalServerMode = 'production' | 'custom';

/** In-flight device-code grant; the app shows userCode and polls with deviceCode. */
export interface AlmostUsefulHandoffPending {
	deviceCode: string;
	userCode: string;
	/** Epoch ms after which the portal rejects this device code with expired_token. */
	expiresAt: number;
	intervalSeconds: number;
	/** Portal page where the user types userCode; reopened by Open website after re-render. */
	verificationUri: string;
}

export interface AlmostUsefulDebugConfig {
	/**
	 * Development-only. Missing means Custom (localhost / last custom URL).
	 * Production builds ignore this and always use the public portal.
	 */
	portalServerMode?: AlmostUsefulPortalServerMode;
	/** When Custom is active in a development build, jobs and sign-in use this host. */
	portalOrigin?: string;
	/** Last Custom field value so Production ↔ Custom can restore localhost or staging. */
	customPortalOrigin?: string;
}

/** Reads a live app-token session. Plan 2 user JWTs are discarded. */
export function readAlmostUsefulSession(): AlmostUsefulSession | null {
	const raw = fetchLocally(ALMOSTUSEFUL_SESSION_STORAGE_SUFFIX);
	if (typeof raw !== 'string') return null;
	try {
		const parsedUnknown: unknown = JSON.parse(raw);
		if (!parsedUnknown || typeof parsedUnknown !== 'object') return null;
		const parsed = parsedUnknown as Partial<AlmostUsefulSession> & { tokenType?: string };
		if (parsed.tokenType !== ALMOSTUSEFUL_APP_TOKEN_TYPE) {
			deleteLocally(ALMOSTUSEFUL_SESSION_STORAGE_SUFFIX);
			return null;
		}
		if (typeof parsed.accessToken !== 'string') return null;
		if (typeof parsed.refreshToken !== 'string') return null;
		if (typeof parsed.grantId !== 'string') return null;
		if (typeof parsed.userId !== 'string') return null;
		let expiresAtEpochSeconds = 0;
		if (typeof parsed.expiresAtEpochSeconds === 'number') {
			expiresAtEpochSeconds = parsed.expiresAtEpochSeconds;
		}
		let clientId = ALMOSTUSEFUL_CLIENT_ID;
		if (typeof parsed.clientId === 'string' && parsed.clientId) clientId = parsed.clientId;
		let displayName = ALMOSTUSEFUL_CLIENT_DISPLAY_NAME;
		if (typeof parsed.displayName === 'string' && parsed.displayName) {
			displayName = parsed.displayName;
		}
		return {
			tokenType: ALMOSTUSEFUL_APP_TOKEN_TYPE,
			accessToken: parsed.accessToken,
			refreshToken: parsed.refreshToken,
			expiresAtEpochSeconds,
			grantId: parsed.grantId,
			userId: parsed.userId,
			clientId,
			displayName,
			userEmail: typeof parsed.userEmail === 'string' ? parsed.userEmail : null,
		};
	} catch {
		return null;
	}
}

/** Persists the app-token session in device-local storage (not data.json). */
export function writeAlmostUsefulSession(session: AlmostUsefulSession): void {
	saveLocally(ALMOSTUSEFUL_SESSION_STORAGE_SUFFIX, JSON.stringify(session));
	window.dispatchEvent(new CustomEvent(ALMOSTUSEFUL_SESSION_CHANGED_EVENT));
}

/** Clears the Almost Useful session (Log out). */
export function clearAlmostUsefulSession(): void {
	deleteLocally(ALMOSTUSEFUL_SESSION_STORAGE_SUFFIX);
	window.dispatchEvent(new CustomEvent(ALMOSTUSEFUL_SESSION_CHANGED_EVENT));
}

/**
 * True when this device has a linked Almost Useful app-token session.
 * Portal jobs (handwriting transcription) enforce credits on POST (402).
 */
export function hasLinkedAlmostUsefulAccount(): boolean {
	return Boolean(readAlmostUsefulSession()?.accessToken);
}

/** Stores the device code until the token poll succeeds, is denied, or is cancelled. */
export function writeAlmostUsefulHandoffPending(pending: AlmostUsefulHandoffPending): void {
	saveLocally(ALMOSTUSEFUL_HANDOFF_STORAGE_SUFFIX, JSON.stringify(pending));
}

/** Reads the in-flight device code. Older PKCE-shaped handoffs read as null (signed out). */
export function readAlmostUsefulHandoffPending(): AlmostUsefulHandoffPending | null {
	const raw = fetchLocally(ALMOSTUSEFUL_HANDOFF_STORAGE_SUFFIX);
	if (typeof raw !== 'string') return null;
	try {
		const parsedUnknown: unknown = JSON.parse(raw);
		if (!parsedUnknown || typeof parsedUnknown !== 'object') return null;
		const parsed = parsedUnknown as Partial<AlmostUsefulHandoffPending>;
		if (typeof parsed.deviceCode !== 'string') return null;
		if (typeof parsed.userCode !== 'string') return null;
		if (typeof parsed.expiresAt !== 'number') return null;
		if (typeof parsed.intervalSeconds !== 'number') return null;
		if (typeof parsed.verificationUri !== 'string') return null;
		return {
			deviceCode: parsed.deviceCode,
			userCode: parsed.userCode,
			expiresAt: parsed.expiresAt,
			intervalSeconds: parsed.intervalSeconds,
			verificationUri: rewriteAlmostUsefulPortalVerificationUri(parsed.verificationUri),
		};
	} catch {
		return null;
	}
}

/** Drops the in-flight device code after sign-in, denial, or cancel. */
export function clearAlmostUsefulHandoffPending(): void {
	deleteLocally(ALMOSTUSEFUL_HANDOFF_STORAGE_SUFFIX);
}

/** Optional debug override for a staging portal host. */
export function readAlmostUsefulDebugConfig(): AlmostUsefulDebugConfig {
	const raw = fetchLocally(ALMOSTUSEFUL_DEBUG_STORAGE_SUFFIX);
	if (typeof raw !== 'string') return {};
	try {
		const parsedUnknown: unknown = JSON.parse(raw);
		if (!parsedUnknown || typeof parsedUnknown !== 'object') return {};
		return parsedUnknown as AlmostUsefulDebugConfig;
	} catch {
		return {};
	}
}

/** Saves debug portal origin (device-local). */
export function writeAlmostUsefulDebugConfig(config: AlmostUsefulDebugConfig): void {
	saveLocally(ALMOSTUSEFUL_DEBUG_STORAGE_SUFFIX, JSON.stringify(config));
}

/**
 * Device-code responses include verification_uri from the portal's configured
 * site URL, which may still point at production when the API is localhost.
 * Always open the host Ink is using for OAuth.
 */
export function rewriteAlmostUsefulPortalVerificationUri(verificationUri: string): string {
	const portalOrigin = resolveAlmostUsefulPortalOrigin().replace(/\/$/, '');
	try {
		const parsed = new URL(verificationUri);
		return `${portalOrigin}${parsed.pathname}${parsed.search}`;
	} catch {
		return `${portalOrigin}/oauth/device`;
	}
}

/** Portal origin used for authorize and usage APIs. */
export function resolveAlmostUsefulPortalOrigin(): string {
	// Community / `npm run build` copies must not use a leftover localhost override.
	if (!isInkDevelopmentBuild()) return ALMOSTUSEFUL_PORTAL_ORIGIN;
	const config = readAlmostUsefulDebugConfig();
	if (config.portalServerMode === 'production') return ALMOSTUSEFUL_PORTAL_ORIGIN;
	const override = config.portalOrigin?.trim();
	if (override) return override.replace(/\/$/, '');
	return ALMOSTUSEFUL_DEFAULT_CUSTOM_PORTAL_ORIGIN;
}

export function rememberedAlmostUsefulCustomPortalOrigin(): string {
	const remembered = readAlmostUsefulDebugConfig().customPortalOrigin?.trim();
	if (remembered) return remembered.replace(/\/$/, '');
	return ALMOSTUSEFUL_DEFAULT_CUSTOM_PORTAL_ORIGIN;
}

export function resolveAlmostUsefulPortalServerMode(): AlmostUsefulPortalServerMode {
	if (!isInkDevelopmentBuild()) return 'production';
	if (readAlmostUsefulDebugConfig().portalServerMode === 'production') return 'production';
	return 'custom';
}

export function isAlmostUsefulCustomPortalOriginActive(): boolean {
	return resolveAlmostUsefulPortalServerMode() === 'custom';
}

/** Origin actually stored, not the development default. Used when switching so revoke hits the old host. */
export function storedAlmostUsefulPortalOriginOrProduction(): string {
	const override = readAlmostUsefulDebugConfig().portalOrigin?.trim();
	if (override) return override.replace(/\/$/, '');
	return ALMOSTUSEFUL_PORTAL_ORIGIN;
}

/**
 * Normalises a Custom host. Rejects anything that is not http(s) so a typo
 * cannot send tokens to a mystery scheme.
 */
export function normalizeAlmostUsefulPortalOriginInput(raw: string): string | null {
	const trimmed = raw.trim().replace(/\/$/, '');
	if (!trimmed) return null;
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
		return `${parsed.protocol}//${parsed.host}`;
	} catch {
		return null;
	}
}

/**
 * Writes the development portal override. Caller should log out first when the
 * resolved origin will change so revoke still hits the previous host.
 */
export function resolveAlmostUsefulPortalServerChoice(
	mode: AlmostUsefulPortalServerMode,
	customOriginRaw: string,
): { ok: true; origin: string } | { ok: false; error: string } {
	if (mode === 'production') {
		return { ok: true, origin: ALMOSTUSEFUL_PORTAL_ORIGIN };
	}
	const origin = normalizeAlmostUsefulPortalOriginInput(customOriginRaw)
		?? normalizeAlmostUsefulPortalOriginInput(rememberedAlmostUsefulCustomPortalOrigin());
	if (!origin) {
		return { ok: false, error: 'Enter an http or https address such as http://localhost:3000' };
	}
	return { ok: true, origin };
}

export function writeAlmostUsefulPortalServerMode(
	mode: AlmostUsefulPortalServerMode,
	customOriginRaw: string,
): { ok: true; origin: string } | { ok: false; error: string } {
	const choice = resolveAlmostUsefulPortalServerChoice(mode, customOriginRaw);
	if (!choice.ok) return choice;
	if (mode === 'custom') {
		writeAlmostUsefulDebugConfig({
			portalServerMode: 'custom',
			portalOrigin: choice.origin,
			customPortalOrigin: choice.origin,
		});
		return choice;
	}
	const remembered = normalizeAlmostUsefulPortalOriginInput(customOriginRaw)
		?? rememberedAlmostUsefulCustomPortalOrigin();
	writeAlmostUsefulDebugConfig({
		portalServerMode: 'production',
		customPortalOrigin: remembered,
	});
	return choice;
}

/** Subscribes settings UI to session changes. */
export function subscribeAlmostUsefulSessionChanged(onChange: () => void): () => void {
	const handler = () => {
		onChange();
	};
	window.addEventListener(ALMOSTUSEFUL_SESSION_CHANGED_EVENT, handler);
	return () => {
		window.removeEventListener(ALMOSTUSEFUL_SESSION_CHANGED_EVENT, handler);
	};
}
