/** Official Ink attribution on portal jobs (plan 1). Forks should change these. */
export const ALMOSTUSEFUL_CLIENT_ID = 'ink';
export const ALMOSTUSEFUL_CLIENT_DISPLAY_NAME = 'Ink';

/** Production portal. URL + anon key are public client identifiers, not secrets. */
export const ALMOSTUSEFUL_PORTAL_ORIGIN = 'https://account.almostuseful.xyz';
export const ALMOSTUSEFUL_SUPABASE_URL = 'https://xybqkzdwetninrtrfiwr.supabase.co';
export const ALMOSTUSEFUL_SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5YnFremR3ZXRuaW5ydHJmaXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzE2NjcsImV4cCI6MjEwMTE0NzY2N30.BdeBjqlWTm6qYozcQ5w3VP-4ELU5E8uhjmlzCfSvk1U';

export const ALMOSTUSEFUL_REDIRECT_URI = 'obsidian://ink-almostuseful-auth';
export const ALMOSTUSEFUL_PROTOCOL_ACTION = 'ink-almostuseful-auth';

/** Suffix for saveLocally — full key is au_ink_almostuseful_session. */
export const ALMOSTUSEFUL_SESSION_STORAGE_SUFFIX = 'almostuseful_session';
/** In-flight PKCE verifier + state until HTTPS exchange completes. */
export const ALMOSTUSEFUL_HANDOFF_STORAGE_SUFFIX = 'almostuseful_handoff';
/** Optional staging origin / supabase overrides (device-local). */
export const ALMOSTUSEFUL_DEBUG_STORAGE_SUFFIX = 'almostuseful_debug';

export const ALMOSTUSEFUL_SESSION_CHANGED_EVENT = 'ddc-ink-almostuseful-session-changed';
