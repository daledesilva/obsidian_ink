import { ALMOSTUSEFUL_USAGE_CACHE_STORAGE_SUFFIX } from 'src/logic/almostuseful/almostuseful-constants';
import type { AlmostUsefulBurndownPool } from 'src/logic/almostuseful/almostuseful-usage';
import { fetchLocally, saveLocally } from 'src/logic/utils/storage';

interface AlmostUsefulUsageCachePayload {
	userId: string;
	pools: AlmostUsefulBurndownPool[];
}

/** Last successful burndown for this user so the settings tab can paint immediately. */
export function readAlmostUsefulUsageCache(userId: string): AlmostUsefulBurndownPool[] | null {
	const raw = fetchLocally(ALMOSTUSEFUL_USAGE_CACHE_STORAGE_SUFFIX);
	if (typeof raw !== 'string') return null;
	try {
		const parsedUnknown: unknown = JSON.parse(raw);
		if (!parsedUnknown || typeof parsedUnknown !== 'object') return null;
		const parsed = parsedUnknown as Partial<AlmostUsefulUsageCachePayload>;
		if (parsed.userId !== userId) return null;
		if (!Array.isArray(parsed.pools)) return null;
		return parsed.pools;
	} catch {
		return null;
	}
}

export function writeAlmostUsefulUsageCache(userId: string, pools: AlmostUsefulBurndownPool[]): void {
	saveLocally(
		ALMOSTUSEFUL_USAGE_CACHE_STORAGE_SUFFIX,
		JSON.stringify({ userId, pools }),
	);
}
