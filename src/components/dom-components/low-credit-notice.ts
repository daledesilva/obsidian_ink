import { Notice } from 'obsidian';
import {
	createNoticeCtaBar,
	createNoticeTemplate,
	launchPersistentNotice,
} from 'src/components/dom-components/notice-components';
import { openAlmostUsefulBrowserUrl } from 'src/logic/almostuseful/almostuseful-login';
import {
	resolveAlmostUsefulPortalOrigin,
	type AlmostUsefulSession,
} from 'src/logic/almostuseful/almostuseful-session';
import {
	hasLowCreditThresholdBeenShown,
	markLowCreditThresholdShown,
} from 'src/logic/device-settings/device-settings';
import {
	nearestWholePercentAboveRemaining,
	resolveRemainingCreditPercent,
	selectReachedLowCreditThreshold,
} from 'src/logic/almostuseful/low-credit-thresholds';
import { readAlmostUsefulUsageCache } from 'src/logic/almostuseful/almostuseful-usage-cache';
import { verbose } from 'src/logic/utils/universal-dev-logging';

//////////
//////////

/**
 * The notice currently on screen, so a later, more urgent warning can replace it.
 *
 * A persistent notice can stay up for days. Blocking every later warning while one is
 * visible would mean a user who never dismisses the 5% notice never sees the 2% one.
 */
let activeLowCreditNotice: { notice: Notice; thresholdPercent: number } | null = null;

export interface MaybeShowLowCreditNoticeOptions {
	/** Injectable for Jest so the portal load can be stubbed without network access. */
	loadRemainingCreditPercent?: (session: AlmostUsefulSession) => Promise<number | null>;
	/** Injectable for Jest; production opens the portal in the system browser. */
	openAccountPage?: (url: string) => void;
}

/**
 * Warns once per period when the pool crosses 5% and again at 2%.
 *
 * Runs after a transcription settles because that is the moment credits just changed and
 * the user is already looking at Ink. Every failure path stays silent: a warning is a
 * courtesy, and a network hiccup must never surface an error over a successful transcript.
 */
export async function maybeShowLowCreditNotice(
	session: AlmostUsefulSession | null,
	options?: MaybeShowLowCreditNoticeOptions,
): Promise<void> {
	if (!session) return;

	const remainingPercent = await resolveRemainingCreditPercent(session, {
		loadPercent: options?.loadRemainingCreditPercent,
	});
	if (remainingPercent === null) return;

	const reachedThreshold = selectReachedLowCreditThreshold(remainingPercent);
	if (reachedThreshold === null) return;

	const periodKey = resolveLowCreditNoticePeriodKey(session);
	const hasAlreadyShown = hasLowCreditThresholdBeenShown({
		userId: session.userId,
		periodKey,
		thresholdPercent: reachedThreshold,
	});
	if (hasAlreadyShown) return;

	// A 2% warning must still appear when the 5% notice was never dismissed, so the more
	// urgent level replaces it. The same level on screen is left alone rather than stacked.
	const isSameOrMoreUrgentAlreadyShowing =
		activeLowCreditNotice !== null
		&& activeLowCreditNotice.thresholdPercent <= reachedThreshold;
	if (isSameOrMoreUrgentAlreadyShowing) return;

	verbose(`Low credits notice: ${remainingPercent}% remaining, threshold ${reachedThreshold}%`);
	markLowCreditThresholdShown({
		userId: session.userId,
		periodKey,
		thresholdPercent: reachedThreshold,
	});
	showLowCreditNotice({
		thresholdPercent: reachedThreshold,
		remainingPercent,
	}, options?.openAccountPage);
}

/**
 * Period key for the warning latch: the pool's own reporting period, not the calendar.
 *
 * Using the pool's period means the warning re-arms exactly when credits refill, even for
 * a billing cycle that does not start on the first of the month.
 */
function resolveLowCreditNoticePeriodKey(session: AlmostUsefulSession): string {
	const series = readAlmostUsefulUsageCache(session.userId)?.[0]?.series;
	if (!series) return '';
	return `${series.periodStartDay}..${series.periodLastDay}`;
}

interface LowCreditNoticeContent {
	/** 5 or 2. Decides which warning this is, and whether a later one may replace it. */
	thresholdPercent: number;
	/** Actual pool remaining. The sentence rounds this up; it does not print the threshold. */
	remainingPercent: number;
}

/**
 * Persistent Ink-styled warning with a Dismiss and a primary View account action.
 *
 * Persistent rather than timed because running out of credits silently blocks a paid
 * feature the user just tried to use; a disappearing toast would hide that.
 * The balance sentence uses the real remaining percent, so a 5% warning at 2.9% says
 * "less than 3%" rather than repeating the threshold. The body is that sentence only:
 * the title and View account already tell the user what the warning means and what to do.
 */
function showLowCreditNotice(
	content: LowCreditNoticeContent,
	openAccountPage?: (url: string) => void,
): void {
	const lessThanPercent = nearestWholePercentAboveRemaining(content.remainingPercent);
	const { noticeBody, scrollAreaEl, footerEl } = createNoticeTemplate();
	scrollAreaEl.createEl('h1').setText('AI credits are running low');
	// One sentence is enough. The title and the View account button already say what to do.
	scrollAreaEl.createEl('p').setText(`You have less than ${lessThanPercent}% left.`);

	const { primaryBtnEl, tertiaryBtnEl } = createNoticeCtaBar(footerEl, {
		primaryLabel: 'View account',
		tertiaryLabel: 'Dismiss',
	});

	const notice = launchPersistentNotice(noticeBody);
	// Replace any less urgent warning still on screen; its threshold stays recorded so it
	// does not re-fire, but the user only ever reads one warning at a time.
	// Notice.hide() only starts Obsidian's dismiss animation, so the previous warning
	// stays readable beside the new one. Removing the element finishes the replacement.
	const previousNotice = activeLowCreditNotice?.notice;
	previousNotice?.hide();
	previousNotice?.noticeEl?.remove();
	activeLowCreditNotice = { notice, thresholdPercent: content.thresholdPercent };

	const dismissNotice = (): void => {
		if (activeLowCreditNotice?.notice === notice) activeLowCreditNotice = null;
		notice.hide();
	};

	if (tertiaryBtnEl) {
		tertiaryBtnEl.addEventListener('click', () => {
			dismissNotice();
		});
	}

	if (primaryBtnEl) {
		primaryBtnEl.addEventListener('click', () => {
			dismissNotice();
			const accountUrl = `${resolveAlmostUsefulPortalOrigin().replace(/\/$/, '')}/account`;
			if (openAccountPage) {
				openAccountPage(accountUrl);
				return;
			}
			openAlmostUsefulBrowserUrl(accountUrl);
		});
	}
}

/** Test hook: forgets any notice still considered on screen between notice cases. */
export function resetLowCreditNoticeShowingForTests(): void {
	activeLowCreditNotice = null;
}
