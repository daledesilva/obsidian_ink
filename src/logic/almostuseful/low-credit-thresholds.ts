import {
	readAlmostUsefulUsageCache,
	writeAlmostUsefulUsageCache,
} from 'src/logic/almostuseful/almostuseful-usage-cache';
import {
	fetchAlmostUsefulBurndown,
	type AlmostUsefulBurndownPool,
} from 'src/logic/almostuseful/almostuseful-usage';
import type { AlmostUsefulSession } from 'src/logic/almostuseful/almostuseful-session';

//////////
//////////

/**
 * Credit thresholds, in percent of the monthly pool remaining, that raise a notice.
 *
 * Two separate warnings because the first is a heads-up the user can plan around and the
 * second is close enough to running out to be actionable now. Each fires once per period
 * and per threshold, so a user is not nagged on every transcription.
 */
export const LOW_CREDIT_NOTICE_THRESHOLDS_PERCENT = [5, 2] as const;

export type LowCreditThresholdPercent = (typeof LOW_CREDIT_NOTICE_THRESHOLDS_PERCENT)[number];

/**
 * Remaining percent of the first pool, or null when usage has never been loaded.
 *
 * Reads the cached usage first so a transcription on a quiet vault does not have to wait
 * on a network round trip before it can decide whether to warn. A pool is only read when
 * its series exists, matching the settings charts which refuse to paint partial payloads.
 */
export function readRemainingCreditPercent(
	cachedPools: AlmostUsefulBurndownPool[] | null,
): number | null {
	const primaryPool = cachedPools?.[0];
	const points = primaryPool?.series?.points;
	if (!points || points.length === 0) return null;
	const latestPoint = points[points.length - 1];
	if (!Number.isFinite(latestPoint.remainingPercent)) return null;
	return latestPoint.remainingPercent;
}

export interface ResolveRemainingCreditPercentOptions {
	/** Injectable for Jest so the portal fetch can be stubbed without network access. */
	loadPercent?: (session: AlmostUsefulSession) => Promise<number | null>;
}

/**
 * Best-effort remaining credit percent, cache first then portal.
 *
 * Returns null when the value cannot be known, because "unknown" must not be treated as
 * "low" — warning a user with a full pool would be worse than staying quiet.
 */
export async function resolveRemainingCreditPercent(
	session: AlmostUsefulSession,
	options?: ResolveRemainingCreditPercentOptions,
): Promise<number | null> {
	const cachedPools = readAlmostUsefulUsageCache(session.userId);
	const cachedPercent = readRemainingCreditPercent(cachedPools);
	if (cachedPercent !== null) return cachedPercent;

	const loadPercent = options?.loadPercent ?? defaultLoadRemainingPercent;
	try {
		return await loadPercent(session);
	} catch {
		return null;
	}
}

/** Portal read used when this device has no cached usage yet. */
async function defaultLoadRemainingPercent(session: AlmostUsefulSession): Promise<number | null> {
	const burndown = await fetchAlmostUsefulBurndown(session);
	if ('unauthorized' in burndown) return null;
	writeAlmostUsefulUsageCache(session.userId, burndown);
	return readRemainingCreditPercent(burndown);
}

/**
 * Whole percent the notice can say the balance is under.
 *
 * 2.9 is under 3, and 0.2 is under 1. An exact whole number is under the next one,
 * so 4 remaining is "less than 5", not "less than 4". Anything under 1% is "less than 1".
 * This is the displayed figure. It is not the 5% or 2% threshold that decided to warn.
 */
export function nearestWholePercentAboveRemaining(remainingPercent: number): number {
	if (!Number.isFinite(remainingPercent) || remainingPercent < 1) return 1;
	const nearestWholePercent = Math.ceil(remainingPercent);
	if (nearestWholePercent === remainingPercent) return nearestWholePercent + 1;
	return nearestWholePercent;
}

/**
 * The most urgent threshold this remaining percent has reached, or null when credits are fine.
 *
 * Crossed thresholds are compared with `<=` so a job that lands the user at exactly 5% or 2%
 * still warns. The lowest reached threshold wins: a single job that drops from 6% to 1% has
 * crossed both, and showing only the most urgent one avoids two stacked notices for one job.
 * The returned 5 or 2 is the latch key. The notice sentence uses the real balance instead.
 */
export function selectReachedLowCreditThreshold(
	remainingPercent: number,
): LowCreditThresholdPercent | null {
	let reachedThreshold: LowCreditThresholdPercent | null = null;
	for (const threshold of LOW_CREDIT_NOTICE_THRESHOLDS_PERCENT) {
		if (remainingPercent <= threshold) reachedThreshold = threshold;
	}
	return reachedThreshold;
}
