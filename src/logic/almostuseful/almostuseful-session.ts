import {
	ALMOSTUSEFUL_APP_TOKEN_TYPE,
	ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
	ALMOSTUSEFUL_CLIENT_ID,
	ALMOSTUSEFUL_DEBUG_STORAGE_SUFFIX,
	ALMOSTUSEFUL_HANDOFF_STORAGE_SUFFIX,
	ALMOSTUSEFUL_PORTAL_ORIGIN,
	ALMOSTUSEFUL_SESSION_CHANGED_EVENT,
	ALMOSTUSEFUL_SESSION_STORAGE_SUFFIX,
} from 'src/logic/almostuseful/almostuseful-constants';
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

export interface AlmostUsefulHandoffPending {
	state: string;
	codeVerifier: string;
}

export interface AlmostUsefulDebugConfig {
	portalOrigin?: string;
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

/** Stores PKCE verifier until the protocol handler exchanges the code. */
export function writeAlmostUsefulHandoffPending(pending: AlmostUsefulHandoffPending): void {
	saveLocally(ALMOSTUSEFUL_HANDOFF_STORAGE_SUFFIX, JSON.stringify(pending));
}

/** Reads in-flight authorize PKCE state. */
export function readAlmostUsefulHandoffPending(): AlmostUsefulHandoffPending | null {
	const raw = fetchLocally(ALMOSTUSEFUL_HANDOFF_STORAGE_SUFFIX);
	if (typeof raw !== 'string') return null;
	try {
		const parsedUnknown: unknown = JSON.parse(raw);
		if (!parsedUnknown || typeof parsedUnknown !== 'object') return null;
		const parsed = parsedUnknown as Partial<AlmostUsefulHandoffPending>;
		if (typeof parsed.state !== 'string') return null;
		if (typeof parsed.codeVerifier !== 'string') return null;
		return { state: parsed.state, codeVerifier: parsed.codeVerifier };
	} catch {
		return null;
	}
}

/** Drops the in-flight PKCE verifier after exchange or cancel. */
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

/** Portal origin used for authorize and usage APIs. */
export function resolveAlmostUsefulPortalOrigin(): string {
	const override = readAlmostUsefulDebugConfig().portalOrigin?.trim();
	if (override) return override.replace(/\/$/, '');
	return ALMOSTUSEFUL_PORTAL_ORIGIN;
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
