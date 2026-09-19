import {
	ALMOSTUSEFUL_DEBUG_STORAGE_SUFFIX,
	ALMOSTUSEFUL_HANDOFF_STORAGE_SUFFIX,
	ALMOSTUSEFUL_PORTAL_ORIGIN,
	ALMOSTUSEFUL_SESSION_CHANGED_EVENT,
	ALMOSTUSEFUL_SESSION_STORAGE_SUFFIX,
	ALMOSTUSEFUL_SUPABASE_ANON_KEY,
	ALMOSTUSEFUL_SUPABASE_URL,
} from 'src/logic/almostuseful/almostuseful-constants';
import { deleteLocally, fetchLocally, saveLocally } from 'src/logic/utils/storage';

/////////
/////////

export interface AlmostUsefulSession {
	accessToken: string;
	refreshToken: string;
	expiresAtEpochSeconds: number;
	userId: string;
	email: string | null;
	displayName: string | null;
}

export interface AlmostUsefulHandoffPending {
	state: string;
	codeVerifier: string;
}

export interface AlmostUsefulDebugConfig {
	portalOrigin?: string;
	supabaseUrl?: string;
	supabaseAnonKey?: string;
}

/** Reads the device-local Almost Useful session, or null. */
export function readAlmostUsefulSession(): AlmostUsefulSession | null {
	const raw = fetchLocally(ALMOSTUSEFUL_SESSION_STORAGE_SUFFIX);
	if (typeof raw !== 'string') return null;
	try {
		const parsedUnknown: unknown = JSON.parse(raw);
		if (!parsedUnknown || typeof parsedUnknown !== 'object') return null;
		const parsed = parsedUnknown as Partial<AlmostUsefulSession>;
		if (typeof parsed.accessToken !== 'string') return null;
		if (typeof parsed.refreshToken !== 'string') return null;
		if (typeof parsed.userId !== 'string') return null;
		let expiresAtEpochSeconds = 0;
		if (typeof parsed.expiresAtEpochSeconds === 'number') {
			expiresAtEpochSeconds = parsed.expiresAtEpochSeconds;
		}
		return {
			accessToken: parsed.accessToken,
			refreshToken: parsed.refreshToken,
			expiresAtEpochSeconds,
			userId: parsed.userId,
			email: typeof parsed.email === 'string' ? parsed.email : null,
			displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
		};
	} catch {
		return null;
	}
}

/** Persists the session in device-local storage (not data.json). */
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

/** Reads in-flight handoff PKCE state. */
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

/** Optional debug overrides for staging portal hosts. */
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

/** Saves debug portal/supabase overrides (device-local). */
export function writeAlmostUsefulDebugConfig(config: AlmostUsefulDebugConfig): void {
	saveLocally(ALMOSTUSEFUL_DEBUG_STORAGE_SUFFIX, JSON.stringify(config));
}

/** Portal origin used for handoff and usage APIs. */
export function resolveAlmostUsefulPortalOrigin(): string {
	const override = readAlmostUsefulDebugConfig().portalOrigin?.trim();
	if (override) return override.replace(/\/$/, '');
	return ALMOSTUSEFUL_PORTAL_ORIGIN;
}

/** Supabase URL for session refresh (anon key only). */
export function resolveAlmostUsefulSupabaseUrl(): string {
	const override = readAlmostUsefulDebugConfig().supabaseUrl?.trim();
	if (override) return override.replace(/\/$/, '');
	return ALMOSTUSEFUL_SUPABASE_URL;
}

/** Public anon key matching the resolved Supabase URL. */
export function resolveAlmostUsefulSupabaseAnonKey(): string {
	const override = readAlmostUsefulDebugConfig().supabaseAnonKey?.trim();
	if (override) return override;
	return ALMOSTUSEFUL_SUPABASE_ANON_KEY;
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
