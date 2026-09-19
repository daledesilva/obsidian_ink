/** Official Ink attribution on portal jobs and authorize. Forks should change these. */
export const ALMOSTUSEFUL_CLIENT_ID = 'ink';
export const ALMOSTUSEFUL_CLIENT_DISPLAY_NAME = 'Ink';

/** Production portal. Public client identifier, not a secret. */
export const ALMOSTUSEFUL_PORTAL_ORIGIN = 'https://account.almostuseful.xyz';

export const ALMOSTUSEFUL_REDIRECT_URI = 'obsidian://ink-almostuseful-auth';
export const ALMOSTUSEFUL_PROTOCOL_ACTION = 'ink-almostuseful-auth';

export const ALMOSTUSEFUL_APP_TOKEN_TYPE = 'almostuseful_app';

/** Suffix for saveLocally — full key is au_ink_almostuseful_session. */
export const ALMOSTUSEFUL_SESSION_STORAGE_SUFFIX = 'almostuseful_session';
/** In-flight PKCE verifier + state until HTTPS exchange completes. */
export const ALMOSTUSEFUL_HANDOFF_STORAGE_SUFFIX = 'almostuseful_handoff';
/** Optional staging portal origin (device-local). */
export const ALMOSTUSEFUL_DEBUG_STORAGE_SUFFIX = 'almostuseful_debug';

export const ALMOSTUSEFUL_SESSION_CHANGED_EVENT = 'ddc-ink-almostuseful-session-changed';
