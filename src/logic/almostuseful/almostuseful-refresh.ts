import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
	readAlmostUsefulSession,
	resolveAlmostUsefulSupabaseAnonKey,
	resolveAlmostUsefulSupabaseUrl,
	writeAlmostUsefulSession,
} from 'src/logic/almostuseful/almostuseful-session';

/////////
/////////

let almostUsefulSupabaseClient: SupabaseClient | null = null;

/**
 * Attaches supabase-js refresh to the device-local session (anon key only).
 * persistSession is false so tokens never land in the default localStorage key.
 * Call again after login — onload may have run while signed out.
 */
export async function startAlmostUsefulSessionRefresh(): Promise<void> {
	const session = readAlmostUsefulSession();
	if (!session) {
		await stopAlmostUsefulSessionRefresh();
		return;
	}

	if (!almostUsefulSupabaseClient) {
		almostUsefulSupabaseClient = createClient(
			resolveAlmostUsefulSupabaseUrl(),
			resolveAlmostUsefulSupabaseAnonKey(),
			{
				auth: {
					persistSession: false,
					autoRefreshToken: true,
				},
			},
		);

		almostUsefulSupabaseClient.auth.onAuthStateChange((_event, nextSession) => {
			if (!nextSession) return;
			const existing = readAlmostUsefulSession();
			if (!existing) return;
			writeAlmostUsefulSession({
				...existing,
				accessToken: nextSession.access_token,
				refreshToken: nextSession.refresh_token,
				expiresAtEpochSeconds: nextSession.expires_at ?? existing.expiresAtEpochSeconds,
			});
		});
	}

	await almostUsefulSupabaseClient.auth.setSession({
		access_token: session.accessToken,
		refresh_token: session.refreshToken,
	});
}

/** Drops the supabase-js client so Log out does not keep refreshing tokens. */
export async function stopAlmostUsefulSessionRefresh(): Promise<void> {
	if (!almostUsefulSupabaseClient) return;
	await almostUsefulSupabaseClient.auth.signOut();
	almostUsefulSupabaseClient = null;
}
