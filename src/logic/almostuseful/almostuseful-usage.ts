import { almostUsefulRequestJson } from 'src/logic/almostuseful/almostuseful-http';
import {
	clearAlmostUsefulSession,
	resolveAlmostUsefulPortalOrigin,
	type AlmostUsefulSession,
} from 'src/logic/almostuseful/almostuseful-session';

/////////
/////////

export interface AlmostUsefulBurndownPoint {
	date: string;
	creditsRemaining: number;
	creditsDebited: number;
	idealRemaining: number;
}

export interface AlmostUsefulBurndownSeries {
	periodStartDay: string;
	periodLastDay: string;
	chartTimeZone: string;
	creditsAllotted: number;
	points: AlmostUsefulBurndownPoint[];
}

export interface AlmostUsefulClientDailyUsagePoint {
	date: string;
	clientId: string;
	clientDisplayName?: string | null;
	creditsUsed: number;
}

export interface AlmostUsefulBurndownPool {
	title?: string;
	series?: AlmostUsefulBurndownSeries;
	clientDailyUsage?: AlmostUsefulClientDailyUsagePoint[];
}

/** Loads burndown JSON for settings charts (no iframe of cookie-only /account). */
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
	const payload = response.json as { pools?: unknown };
	if (!Array.isArray(payload.pools)) return [];
	return payload.pools.flatMap((pool) => parseBurndownPool(pool));
}

function parseBurndownPool(raw: unknown): AlmostUsefulBurndownPool[] {
	// Reject incomplete series so settings never paint remaining-only bars from a partial payload.
	if (!raw || typeof raw !== 'object') return [];
	const record = raw as Record<string, unknown>;
	const series = parseBurndownSeries(record.series);
	if (!series) return [];
	const clientDailyUsage = Array.isArray(record.clientDailyUsage)
		? record.clientDailyUsage.flatMap((row) => parseClientDailyUsage(row))
		: [];
	return [
		{
			title: typeof record.title === 'string' ? record.title : undefined,
			series,
			clientDailyUsage,
		},
	];
}

function parseBurndownSeries(raw: unknown): AlmostUsefulBurndownSeries | null {
	if (!raw || typeof raw !== 'object') return null;
	const record = raw as Record<string, unknown>;
	if (!Array.isArray(record.points) || record.points.length === 0) return null;
	const points = record.points.flatMap((point) => parseBurndownPoint(point));
	if (points.length === 0) return null;
	const periodStartDay =
		typeof record.periodStartDay === 'string' ? record.periodStartDay : points[0].date;
	const periodLastDay =
		typeof record.periodLastDay === 'string'
			? record.periodLastDay
			: points[points.length - 1].date;
	const chartTimeZone =
		typeof record.chartTimeZone === 'string' ? record.chartTimeZone : 'UTC';
	const creditsAllotted = toFiniteNumber(record.creditsAllotted);
	return {
		periodStartDay,
		periodLastDay,
		chartTimeZone,
		creditsAllotted: creditsAllotted ?? Math.max(...points.map((point) => point.creditsRemaining), 1),
		points,
	};
}

function parseBurndownPoint(raw: unknown): AlmostUsefulBurndownPoint[] {
	if (!raw || typeof raw !== 'object') return [];
	const record = raw as Record<string, unknown>;
	if (typeof record.date !== 'string') return [];
	const creditsRemaining = toFiniteNumber(record.creditsRemaining);
	const creditsDebited = toFiniteNumber(record.creditsDebited);
	const idealRemaining = toFiniteNumber(record.idealRemaining);
	if (creditsRemaining === null || creditsDebited === null || idealRemaining === null) {
		return [];
	}
	return [{ date: record.date, creditsRemaining, creditsDebited, idealRemaining }];
}

function parseClientDailyUsage(raw: unknown): AlmostUsefulClientDailyUsagePoint[] {
	if (!raw || typeof raw !== 'object') return [];
	const record = raw as Record<string, unknown>;
	if (typeof record.date !== 'string' || typeof record.clientId !== 'string') return [];
	const creditsUsed = toFiniteNumber(record.creditsUsed);
	if (creditsUsed === null) return [];
	return [
		{
			date: record.date,
			clientId: record.clientId,
			clientDisplayName:
				typeof record.clientDisplayName === 'string' ? record.clientDisplayName : null,
			creditsUsed,
		},
	];
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}
