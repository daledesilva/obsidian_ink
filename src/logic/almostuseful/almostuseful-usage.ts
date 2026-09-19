import { almostUsefulRequestJson } from 'src/logic/almostuseful/almostuseful-http';
import {
	clearAlmostUsefulSession,
	resolveAlmostUsefulPortalOrigin,
	type AlmostUsefulSession,
} from 'src/logic/almostuseful/almostuseful-session';

/////////
/////////

export interface AlmostUsefulUsageSnapshot {
	creditsRemaining: string | null;
	hasActivePool: boolean;
}

export interface AlmostUsefulBurndownPool {
	title?: string;
	series?: {
		points?: Array<{
			date: string;
			creditsRemaining: number;
			creditsDebited: number;
			idealRemaining: number;
		}>;
	};
	clientDailyUsage?: Array<{
		date: string;
		clientId: string;
		clientDisplayName?: string | null;
		creditsUsed: number;
	}>;
}

/** Loads remaining credits; 401 clears the local session. */
export async function fetchAlmostUsefulUsage(
	session: AlmostUsefulSession,
): Promise<AlmostUsefulUsageSnapshot | { unauthorized: true }> {
	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	const response = await almostUsefulRequestJson({
		url: `${portalOrigin}/api/me/usage`,
		method: 'GET',
		accessToken: session.accessToken,
	});
	if (response.status === 401) {
		clearAlmostUsefulSession();
		return { unauthorized: true };
	}
	if (response.status !== 200 || !response.json || typeof response.json !== 'object') {
		return { creditsRemaining: null, hasActivePool: false };
	}
	const payload = response.json as {
		current?: { credits_remaining?: string } | null;
	};
	if (!payload.current) {
		return { creditsRemaining: null, hasActivePool: false };
	}
	let creditsRemaining: string | null = null;
	if (typeof payload.current.credits_remaining === 'string') {
		creditsRemaining = payload.current.credits_remaining;
	} else if (payload.current.credits_remaining != null) {
		creditsRemaining = String(payload.current.credits_remaining);
	}
	return { creditsRemaining, hasActivePool: true };
}

/** Loads burndown JSON for a simplified settings chart (no iframe). */
export async function fetchAlmostUsefulBurndown(
	session: AlmostUsefulSession,
): Promise<AlmostUsefulBurndownPool[] | { unauthorized: true }> {
	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const response = await almostUsefulRequestJson({
		url: `${portalOrigin}/api/me/usage/burndown?tz=${encodeURIComponent(timeZone)}`,
		method: 'GET',
		accessToken: session.accessToken,
	});
	if (response.status === 401) {
		clearAlmostUsefulSession();
		return { unauthorized: true };
	}
	if (response.status !== 200 || !response.json || typeof response.json !== 'object') {
		return [];
	}
	const payload = response.json as { pools?: AlmostUsefulBurndownPool[] };
	if (!Array.isArray(payload.pools)) return [];
	return payload.pools;
}
