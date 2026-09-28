import { Notice, setIcon, Setting, type ButtonComponent } from 'obsidian';
import InkPlugin from 'src/main';
import { fetchAlmostUsefulBurndown } from 'src/logic/almostuseful/almostuseful-usage';
import {
	readAlmostUsefulUsageCache,
	writeAlmostUsefulUsageCache,
} from 'src/logic/almostuseful/almostuseful-usage-cache';
import { renderAlmostUsefulPoolUsageCharts } from 'src/logic/almostuseful/almostuseful-usage-charts';
import { destroyCreditPoolChartTooltips } from 'src/logic/almostuseful/credit-pool-chart-tooltip';
import {
	cancelAlmostUsefulPendingLogin,
	logOutAlmostUseful,
	openAlmostUsefulBrowserUrl,
	requestAlmostUsefulDeviceCode,
	startAlmostUsefulBrowserLogin,
	startAlmostUsefulDevicePolling,
	type AlmostUsefulDevicePoller,
} from 'src/logic/almostuseful/almostuseful-login';
import {
	readAlmostUsefulHandoffPending,
	readAlmostUsefulSession,
	resolveAlmostUsefulPortalOrigin,
	type AlmostUsefulHandoffPending,
	type AlmostUsefulSession,
} from 'src/logic/almostuseful/almostuseful-session';
import {
	clearHandwritingTranscriptionQueue,
	readHandwritingTranscriptionQueueSnapshot,
	removeHandwritingTranscriptionFromQueue,
	subscribeHandwritingTranscriptionQueueChanged,
} from 'src/logic/handwriting-transcription-queue';
import './almostuseful-account-section.scss';

/////////
/////////

let usageChartsResizeObserver: ResizeObserver | null = null;
let transcriptionQueueUnsubscribe: (() => void) | null = null;
/** Keep expand/collapse across settings re-renders (login, session refresh). */
let isAlmostUsefulAccountSectionExpanded = true;
let deviceCodePoller: AlmostUsefulDevicePoller | null = null;
let deviceCodeCountdownTimer: number | null = null;

/**
 * Polling only runs while the code card is on screen. Called on every section
 * re-render and from the settings tab hide() so a closed settings pane stops polling.
 */
export function stopAlmostUsefulAccountSectionDevicePolling(): void {
	deviceCodePoller?.stop();
	deviceCodePoller = null;
	if (deviceCodeCountdownTimer !== null) {
		window.clearInterval(deviceCodeCountdownTimer);
		deviceCodeCountdownTimer = null;
	}
}

/** Almost Useful account block at the top of Ink settings (no password fields). */
export function insertAlmostUsefulAccountSection(
	containerEl: HTMLElement,
	_plugin: InkPlugin,
	onRerender: () => void,
): void {
	stopAlmostUsefulAccountSectionDevicePolling();
	const session = readAlmostUsefulSession();
	const pending = readAlmostUsefulHandoffPending();
	const portalOrigin = resolveAlmostUsefulPortalOrigin();

	// Accent header/outline styling is scoped to ddc_ink_almostuseful-account-section in SCSS.
	const wrapperEl = containerEl.createDiv(
		'ddc_ink_section-wrapper ddc_ink_almostuseful-account-section',
	);
	if (isAlmostUsefulAccountSectionExpanded) wrapperEl.classList.add('ddc_ink_expanded');
	const sectionEl = wrapperEl.createDiv('ddc_ink_controls-section');

	const headerSetting = new Setting(sectionEl)
		.setClass('ddc_ink_controls-header')
		.setClass('ddc_ink_controls-header--clickable')
		.setName(almostUsefulAccountSectionTitle(session));

	const arrowEl = headerSetting.settingEl.createSpan('ddc_ink_collapse-arrow');
	arrowEl.setText('›');
	if (isAlmostUsefulAccountSectionExpanded) arrowEl.classList.add('ddc_ink_expanded');

	headerSetting.settingEl.addEventListener('click', () => {
		isAlmostUsefulAccountSectionExpanded = wrapperEl.classList.toggle('ddc_ink_expanded');
		arrowEl.classList.toggle('ddc_ink_expanded', isAlmostUsefulAccountSectionExpanded);
	});

	const contentEl = sectionEl.createDiv('ddc_ink_controls-content ddc_ink_almostuseful-account');

	if (!session) {
		if (pending) {
			insertDeviceSignInCodeCard(contentEl, pending, onRerender);
		} else {
			new Setting(contentEl)
				.setClass('ddc_ink_setting')
				.setClass('ddc_ink_almostuseful-link-account-setting')
				.setName('Link account')
				.setDesc(
					'Create and link an Almost Useful account to utilise handwriting transcription. Almost Useful is an accounts portal created by Dale de Silva, the developer of Ink.',
				)
				.addButton((button) => {
					decorateAlmostUsefulLinkAccountButton(button);
					button.onClick(() => {
						button.setDisabled(true);
						void startAlmostUsefulBrowserLogin().then((result) => {
							if (!result.ok) {
								button.setDisabled(false);
								new Notice(result.error);
								return;
							}
							onRerender();
						});
					});
				});
		}
		insertHandwritingTranscriptionPrivacyDisclosure(contentEl);
		insertTranscriptionQueueSection(contentEl);
		return;
	}

	new Setting(contentEl)
		.setClass('ddc_ink_bare-setting')
		.setClass('ddc_ink_bare-setting--left')
		.setClass('ddc_ink_button-set')
		.setClass('ddc_ink_almostuseful-account-actions')
		.addButton((button) => {
			button.setButtonText('Manage account');
			button.onClick(() => {
				openAlmostUsefulBrowserUrl(`${portalOrigin}/account`);
			});
		})
		.addButton((button) => {
			button.setButtonText('Log out');
			button.onClick(() => {
				logOutAlmostUseful();
				onRerender();
			});
		});

	const usageCardEl = contentEl.createDiv('ddc_ink_almostuseful-settings-card');
	const usageHostEl = usageCardEl.createDiv('ddc_ink_almostuseful-usage');
	void loadUsageInto(usageHostEl, session, portalOrigin);
	insertHandwritingTranscriptionPrivacyDisclosure(contentEl);
	insertTranscriptionQueueSection(contentEl);
}

/** Transcription data-flow and retention disclosure; shown signed out and under usage when linked. */
function insertHandwritingTranscriptionPrivacyDisclosure(contentEl: HTMLElement): void {
	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setClass('ddc_ink_almostuseful-processing-data-setting')
		.setName('Processing your data')
		.setDesc(handwritingTranscriptionProcessingDataSettingDesc());
}

function handwritingTranscriptionProcessingDataSettingDesc(): DocumentFragment {
	const frag = createFragment();
	// Plain flow in .setting-item-description (no <p>) so colour/spacing match Link account setDesc text.
	const descEl = createDiv();

	descEl.appendText(
		"When Ink transcribes handwriting, your Ink SVG is sent over ",
	);
	descEl.createEl('strong').setText('HTTPS');
	descEl.appendText(' from your app to ');
	descEl.createEl('strong').setText('Almost Useful');
	descEl.appendText("'s servers, then to ");
	descEl.createEl('strong').setText('OpenRouter');
	descEl.appendText(', which passes it to ');
	descEl.createEl('strong').setText("Google's Gemini");
	descEl.appendText(
		' model to read it. The transcript is returned to your app via the same route and stored in the SVG file as metadata and in all Markdown notes it is embedded in.',
	);
	const retentionEl = descEl.createSpan({ cls: 'ddc_ink_almostuseful-processing-data-retention' });
	retentionEl.createEl('strong').setText('Almost Useful does not store the SVG or transcript');
	retentionEl.appendText(' on its servers after processing.');

	frag.appendChild(descEl);
	return frag;
}

/** Device-local transcription queue card; hidden when the queue is empty. */
function insertTranscriptionQueueSection(contentEl: HTMLElement): void {
	transcriptionQueueUnsubscribe?.();
	transcriptionQueueUnsubscribe = null;

	let cardEl: HTMLElement | null = null;
	let listEl: HTMLElement | null = null;

	const paintQueueList = (): void => {
		const queueItems = readHandwritingTranscriptionQueueSnapshot();
		if (queueItems.length === 0) {
			cardEl?.remove();
			cardEl = null;
			listEl = null;
			return;
		}
		if (!cardEl) {
			cardEl = contentEl.createDiv('ddc_ink_almostuseful-settings-card ddc_ink_almostuseful-transcription-queue');
			const titleRowEl = cardEl.createDiv('ddc_ink_almostuseful-settings-card-title-row');
			titleRowEl.createDiv({
				cls: 'ddc_ink_almostuseful-settings-card-title',
				text: 'Transcription Queue',
			});
			const actionsEl = titleRowEl.createDiv('ddc_ink_almostuseful-settings-card-actions');
			const clearButtonEl = actionsEl.createEl('button', {
				cls: 'ddc_ink_almostuseful-transcription-queue-clear',
				text: 'Clear',
				type: 'button',
			});
			clearButtonEl.addEventListener('click', (event) => {
				event.stopPropagation();
				clearHandwritingTranscriptionQueue();
			});
			listEl = cardEl.createDiv('ddc_ink_almostuseful-transcription-queue-list');
		}
		if (!listEl) return;
		listEl.empty();
		for (const queueItem of queueItems) {
			const rowEl = listEl.createDiv('ddc_ink_almostuseful-transcription-queue-row');
			if (queueItem.isProcessing) {
				const spinnerEl = rowEl.createSpan('ddc_ink_almostuseful-transcription-queue-spinner');
				setIcon(spinnerEl, 'loader-2');
			}
			const labelEl = rowEl.createSpan('ddc_ink_almostuseful-transcription-queue-label');
			const fileName = queueItem.filePath.split('/').pop() ?? queueItem.filePath;
			labelEl.setText(fileName);
			labelEl.setAttr('title', queueItem.filePath);
			const removeButtonEl = rowEl.createEl('button', {
				cls: 'clickable-icon ddc_ink_almostuseful-transcription-queue-remove',
				type: 'button',
				attr: { 'aria-label': `Remove ${fileName} from transcription queue` },
			});
			setIcon(removeButtonEl, 'cross');
			removeButtonEl.addEventListener('click', (event) => {
				event.stopPropagation();
				removeHandwritingTranscriptionFromQueue(queueItem.filePath);
			});
		}
	};

	paintQueueList();
	transcriptionQueueUnsubscribe = subscribeHandwritingTranscriptionQueueChanged(paintQueueList);
}

/** Outline head/shoulders icon plus label; ButtonComponent#setIcon does not reliably pair with text on CTA buttons. */
function decorateAlmostUsefulLinkAccountButton(button: ButtonComponent): void {
	button.setCta();
	button.buttonEl.addClass('ddc_ink_almostuseful-link-account-btn');
	button.buttonEl.empty();
	const iconEl = button.buttonEl.createSpan({ cls: 'ddc_ink_almostuseful-link-account-btn-icon' });
	setIcon(iconEl, 'ddc_ink_link_account_user');
	button.buttonEl.createSpan({
		cls: 'ddc_ink_almostuseful-link-account-btn-label',
		text: 'Link account',
	});
}

function almostUsefulAccountSectionTitle(session: AlmostUsefulSession | null): string {
	if (!session) return 'Almost Useful account';
	const identity = session.userEmail;
	if (identity) return `Almost Useful account: linked as ${identity}`;
	return 'Almost Useful account: linked';
}

const COPIED_LABEL_DURATION_MS = 1500;

/** m:ss until the displayed code expires. */
function formatDeviceCodeTimeRemaining(expiresAt: number): string {
	const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
	const minutes = Math.floor(remainingSeconds / 60);
	const seconds = remainingSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Device-code sign-in: the app shows the code and the user types it on the
 * website (the website has no code to copy back). Polls while this card is on
 * screen. An expired code stays visible until the user chooses Renew.
 */
function insertDeviceSignInCodeCard(
	contentEl: HTMLElement,
	initialPending: AlmostUsefulHandoffPending,
	onRerender: () => void,
): void {
	let displayedPending = initialPending;
	let isCodeExpired = Date.now() >= displayedPending.expiresAt;

	const cardEl = contentEl.createDiv('ddc_ink_almostuseful-handoff-card');
	cardEl.createEl('p', {
		cls: 'ddc_ink_almostuseful-handoff-instruction',
		text: 'Enter this code on the Almost Useful website to authorise Ink.',
	});
	const userCodeEl = cardEl.createDiv({
		cls: 'ddc_ink_almostuseful-handoff-user-code',
		text: displayedPending.userCode,
		attr: { 'aria-label': 'Sign-in code' },
	});
	const copyButtonEl = cardEl.createEl('button', {
		cls: 'mod-cta ddc_ink_almostuseful-handoff-copy-btn',
		text: 'Copy code',
		type: 'button',
	});
	const expiryRowEl = cardEl.createDiv('ddc_ink_almostuseful-handoff-expiry-row');
	const expiryEl = expiryRowEl.createEl('p', { cls: 'ddc_ink_almostuseful-handoff-expiry' });
	const renewEl = expiryRowEl.createEl('button', {
		cls: 'ddc_ink_almostuseful-handoff-renew',
		text: 'Renew the code',
		type: 'button',
	});
	const actionsEl = cardEl.createDiv('ddc_ink_almostuseful-handoff-actions');
	const openWebsiteButtonEl = actionsEl.createEl('button', {
		cls: 'ddc_ink_almostuseful-handoff-secondary-btn',
		text: 'Open website',
		type: 'button',
	});
	const cancelButtonEl = actionsEl.createEl('button', {
		cls: 'ddc_ink_almostuseful-handoff-secondary-btn',
		text: 'Cancel',
		type: 'button',
	});

	const paintExpiry = (): void => {
		if (!isCodeExpired && Date.now() >= displayedPending.expiresAt) isCodeExpired = true;
		userCodeEl.toggleClass('is-expired', isCodeExpired);
		// A dead code must not be copied or opened. Renew and Cancel stay.
		copyButtonEl.toggleClass('is-hidden', isCodeExpired);
		openWebsiteButtonEl.toggleClass('is-hidden', isCodeExpired);
		renewEl.toggleClass('is-hidden', !isCodeExpired);
		if (isCodeExpired) {
			expiryEl.setText('Code expired');
			return;
		}
		expiryEl.setText(`Code expires in ${formatDeviceCodeTimeRemaining(displayedPending.expiresAt)}`);
	};
	paintExpiry();
	deviceCodeCountdownTimer = window.setInterval(paintExpiry, 1000);

	let copiedLabelTimer: number | null = null;
	copyButtonEl.addEventListener('click', () => {
		void navigator.clipboard.writeText(displayedPending.userCode).then(
			() => {
				copyButtonEl.setText('Copied');
				openAlmostUsefulBrowserUrl(displayedPending.verificationUri);
				if (copiedLabelTimer !== null) window.clearTimeout(copiedLabelTimer);
				copiedLabelTimer = window.setTimeout(() => {
					copiedLabelTimer = null;
					copyButtonEl.setText('Copy code');
				}, COPIED_LABEL_DURATION_MS);
			},
			() => {
				new Notice('Could not copy the code. Type it on the website instead.');
			},
		);
	});

	openWebsiteButtonEl.addEventListener('click', () => {
		openAlmostUsefulBrowserUrl(displayedPending.verificationUri);
	});

	const beginPolling = (): void => {
		deviceCodePoller?.stop();
		deviceCodePoller = startAlmostUsefulDevicePolling({
			onExpired: () => {
				isCodeExpired = true;
				paintExpiry();
			},
			onSignedIn: () => {
				onRerender();
			},
			onSignedOut: () => {
				onRerender();
			},
			onError: (message) => {
				new Notice(message);
			},
		});
	};
	beginPolling();

	let isRenewing = false;
	renewEl.addEventListener('click', () => {
		if (isRenewing) return;
		isRenewing = true;
		void requestAlmostUsefulDeviceCode().then((result) => {
			isRenewing = false;
			if (!result.ok) {
				new Notice(result.error);
				return;
			}
			displayedPending = result.pending;
			isCodeExpired = false;
			userCodeEl.setText(result.pending.userCode);
			copyButtonEl.setText('Copy code');
			paintExpiry();
			beginPolling();
		});
	});

	cancelButtonEl.addEventListener('click', () => {
		stopAlmostUsefulAccountSectionDevicePolling();
		cancelAlmostUsefulPendingLogin();
		onRerender();
	});
}

/** Paints cached charts immediately, then refreshes from the portal with a spinning icon. */
async function loadUsageInto(
	hostEl: HTMLElement,
	session: ReturnType<typeof readAlmostUsefulSession>,
	portalOrigin: string,
): Promise<void> {
	if (!session) return;
	usageChartsResizeObserver?.disconnect();
	usageChartsResizeObserver = null;
	destroyCreditPoolChartTooltips();

	const refreshButtonEl = document.createElement('button');
	refreshButtonEl.type = 'button';
	refreshButtonEl.className = 'clickable-icon ddc_ink_almostuseful-refresh';
	refreshButtonEl.setAttribute('aria-label', 'Refresh credit usage');
	setIcon(refreshButtonEl, 'refresh-cw');
	const chartsHostEl = hostEl.createDiv('ddc_ink_almostuseful-usage-charts');

	const cachedPools = readAlmostUsefulUsageCache(session.userId);
	let paintedPools = cachedPools ?? [];
	let lastPlotWidth = 0;
	const paintCharts = (pools: typeof paintedPools) => {
		paintedPools = pools;
		lastPlotWidth = 0;
		const plotWidth = Math.max(chartsHostEl.clientWidth, 240);
		lastPlotWidth = plotWidth;
		destroyCreditPoolChartTooltips();
		chartsHostEl.empty();
		if (pools.length === 0) {
			chartsHostEl.createEl('p', {
				text: 'No subscription activated',
			});
			new Setting(chartsHostEl)
				.setClass('ddc_ink_bare-setting')
				.setClass('ddc_ink_bare-setting--left')
				.addButton((button) => {
					button.setButtonText('Open products').setCta();
					button.onClick(() => {
						openAlmostUsefulBrowserUrl(`${portalOrigin}/account/products`);
					});
				});
			return;
		}
		pools.forEach((pool, index) => {
			const poolEl = chartsHostEl.createDiv('ddc_ink_almostuseful-pool');
			renderAlmostUsefulPoolUsageCharts(
				poolEl,
				pool,
				plotWidth,
				index === 0 ? refreshButtonEl : undefined,
			);
		});
	};

	if (cachedPools) {
		paintCharts(cachedPools);
	} else {
		chartsHostEl.createEl('p', { text: 'Loading credits…', cls: 'ddc_ink_almostuseful-muted' });
	}

	const refreshUsage = async () => {
		refreshButtonEl.classList.add('is-refreshing');
		refreshButtonEl.setAttr('disabled', 'true');
		const burndown = await fetchAlmostUsefulBurndown(session);
		refreshButtonEl.classList.remove('is-refreshing');
		refreshButtonEl.removeAttribute('disabled');
		if ('unauthorized' in burndown) {
			hostEl.empty();
			hostEl.createEl('p', { text: 'Signed out.' });
			return;
		}
		writeAlmostUsefulUsageCache(session.userId, burndown);
		paintCharts(burndown);
	};

	refreshButtonEl.addEventListener('click', () => {
		void refreshUsage();
	});
	usageChartsResizeObserver = new ResizeObserver(() => {
		if (paintedPools.length === 0) return;
		const plotWidth = Math.max(chartsHostEl.clientWidth, 240);
		if (plotWidth === lastPlotWidth && chartsHostEl.querySelector('.ddc_ink_almostuseful-pool')) {
			return;
		}
		paintCharts(paintedPools);
	});
	usageChartsResizeObserver.observe(chartsHostEl);
	void refreshUsage();
}
