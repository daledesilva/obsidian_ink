import { Notice } from 'obsidian';
import {
	cancelAlmostUsefulPendingLogin,
	logOutAlmostUseful,
} from 'src/logic/almostuseful/almostuseful-login';
import {
	readAlmostUsefulDebugConfig,
	readAlmostUsefulSession,
	rememberedAlmostUsefulCustomPortalOrigin,
	resolveAlmostUsefulPortalOrigin,
	resolveAlmostUsefulPortalServerChoice,
	storedAlmostUsefulPortalOriginOrProduction,
	writeAlmostUsefulPortalServerMode,
	type AlmostUsefulPortalServerMode,
} from 'src/logic/almostuseful/almostuseful-session';
import { isInkDevelopmentBuild } from 'src/logic/utils/ink-build-mode';

/////////
/////////

/**
 * Applies Production vs Custom in a development build. Logs out against the
 * previous host before the override changes so revoke still reaches it.
 */
export function applyAlmostUsefulDevPortalServer(
	mode: AlmostUsefulPortalServerMode,
	customOriginRaw: string,
	previousOrigin: string = resolveAlmostUsefulPortalOrigin(),
): { ok: true; origin: string } | { ok: false; error: string } {
	const choice = resolveAlmostUsefulPortalServerChoice(mode, customOriginRaw);
	if (!choice.ok) {
		new Notice(choice.error);
		return choice;
	}
	if (previousOrigin !== choice.origin && readAlmostUsefulSession()) {
		logOutAlmostUseful({ portalOrigin: previousOrigin });
		cancelAlmostUsefulPendingLogin();
		new Notice(`Almost Useful now uses ${choice.origin}. Link account again.`);
	} else if (previousOrigin !== choice.origin) {
		cancelAlmostUsefulPendingLogin();
	}
	return writeAlmostUsefulPortalServerMode(mode, customOriginRaw);
}

/**
 * First development launch (no Production choice stored) sticks on Custom.
 * Production builds never write an override.
 */
export function applyAlmostUsefulDevelopmentPortalDefault(): void {
	if (!isInkDevelopmentBuild()) return;
	const config = readAlmostUsefulDebugConfig();
	if (config.portalServerMode === 'production') return;
	if (config.portalServerMode === 'custom' && config.portalOrigin?.trim()) return;
	applyAlmostUsefulDevPortalServer(
		'custom',
		rememberedAlmostUsefulCustomPortalOrigin(),
		storedAlmostUsefulPortalOriginOrProduction(),
	);
}
