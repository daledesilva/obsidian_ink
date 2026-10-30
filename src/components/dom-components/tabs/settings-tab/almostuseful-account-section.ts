import { Notice, setIcon, Setting, type ButtonComponent } from 'obsidian';
import tippy, { type Instance } from 'tippy.js';
import { decorateAlmostUsefulLinkAccountButton } from 'src/components/dom-components/almostuseful-link-account-button';
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
import type { HandwritingTranscriptionFileType } from 'src/logic/handwriting-transcription-queue-store';
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
	onOpenBatch: (fileType: HandwritingTranscriptionFileType) => void,
): void {
	stopAlmostUsefulAccountSectionDevicePolling();
	destroyAlmostUsefulProcessingFlowTooltips();
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
			const linkAccountSetting = new Setting(contentEl)
				.setClass('ddc_ink_setting')
				.setClass('ddc_ink_almostuseful-link-account-setting')
				.setName('Link account')
				.setDesc(
					'Create and link an Almost Useful account to utilise handwriting transcription. Almost Useful is an accounts portal created by Dale de Silva, the developer of Ink.',
				)
				.addButton((button) => {
					decorateAlmostUsefulLinkAccountButton(button);
					button.onClick(() => {
						if (button.buttonEl.disabled) return;
						// The label is a custom span, so setButtonText would not show the wait state.
						setAlmostUsefulLinkAccountButtonBusy(button, true);
						void startAlmostUsefulBrowserLogin()
							.then((result) => {
								if (!result.ok) {
									setAlmostUsefulLinkAccountButtonBusy(button, false);
									new Notice(result.error);
									return;
								}
								onRerender();
							})
							.catch(() => {
								setAlmostUsefulLinkAccountButtonBusy(button, false);
								new Notice('Could not start Almost Useful sign-in. Try again.');
							});
					});
				});
			const linkAccountCtaStackEl = wrapAlmostUsefulLinkAccountCtaStack(linkAccountSetting.controlEl);
			appendAlmostUsefulCreateAccountLink(linkAccountCtaStackEl, portalOrigin, true);
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
	insertTranscriptionBatchSection({ contentEl }, onOpenBatch);
}

/**
 * Obsidian's Setting owns the button node. Move it into this stack so the
 * 0.825em gap matches the version notice (margin on the button alone was shorter here).
 */
function wrapAlmostUsefulLinkAccountCtaStack(controlEl: HTMLElement): HTMLElement {
	const stackEl = controlEl.createDiv('ddc_ink_almostuseful-link-account-cta-stack');
	const buttonEl = controlEl.querySelector('button.ddc_ink_almostuseful-link-account-btn');
	if (buttonEl?.parentElement === controlEl) {
		stackEl.appendChild(buttonEl);
	}
	return stackEl;
}

/** Tertiary text link under Link account; opens the portal create-account page in the system browser. */
function appendAlmostUsefulCreateAccountLink(
	parentEl: HTMLElement,
	portalOrigin: string,
	isAlignEnd = false,
): void {
	const linkEl = parentEl.createEl('a', {
		cls: isAlignEnd
			? 'ddc_ink_tertiary-text-link ddc_ink_almostuseful-create-account-link--align-end'
			: 'ddc_ink_tertiary-text-link',
		text: 'Create account',
		href: '#',
	});
	linkEl.addEventListener('click', (event) => {
		event.preventDefault();
		openAlmostUsefulBrowserUrl(`${portalOrigin}/auth/sign-up`);
	});
}

/**
 * Transcription data-flow and retention disclosure; shown signed out and under usage when linked.
 * DOM cards, not an SVG: the settings body clips overflow, so a drawing wider than the pane is cut off.
 */
function insertHandwritingTranscriptionPrivacyDisclosure(contentEl: HTMLElement): void {
	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setClass('ddc_ink_almostuseful-processing-data-setting')
		.setName('How your data flows')
		.setDesc(handwritingTranscriptionProcessingDataSettingDesc());
}

interface AlmostUsefulProcessingFlowTooltipSession {
	instance: Instance;
}

const processingFlowTooltipSessions: AlmostUsefulProcessingFlowTooltipSession[] = [];

/** Removes flow tooltips before settings rebuild or close, including body poppers. */
export function destroyAlmostUsefulProcessingFlowTooltips(): void {
	for (const session of processingFlowTooltipSessions) {
		session.instance.destroy();
	}
	processingFlowTooltipSessions.length = 0;
}

export interface BindAlmostUsefulProcessingFlowTooltipProps {
	nodeEl: HTMLElement;
	tooltipText: string;
}

/**
 * Hover shows the tip. A click or tap keeps it open until another press outside the card.
 * Same tippy theme as the credit charts.
 *
 * Do not open these with a manual show() from pointerdown. Tippy's hideOnClick listener
 * is a capture-phase mousedown, and pointerdown runs before that mousedown, so the same
 * press opens the tip and immediately closes it. mouseenter and click run in an order
 * that leaves the tip open. appendTo is read when the tip opens so a popped-out settings
 * window mounts it on that window, not the one that built the fragment.
 */
function bindAlmostUsefulProcessingFlowTooltip(props: BindAlmostUsefulProcessingFlowTooltipProps): void {
	const instance = tippy(props.nodeEl, {
		content: props.tooltipText,
		trigger: 'mouseenter focus click',
		touch: true,
		placement: 'top',
		offset: [0, 8],
		animation: false,
		delay: 0,
		maxWidth: 320,
		theme: 'ddc_ink_almostuseful-chart',
		appendTo: () => props.nodeEl.ownerDocument.body,
		interactive: false,
		popperOptions: {
			strategy: 'fixed',
			modifiers: [
				// Settings panes use overflow:hidden. Popper's hide modifier treats that
				// as the card being clipped and marks the tip hidden even when the card is on screen.
				{ name: 'hide', enabled: false },
				{
					name: 'flip',
					options: {
						fallbackPlacements: ['bottom', 'right', 'left'],
					},
				},
			],
		},
	});
	processingFlowTooltipSessions.push({ instance });
}

export interface AlmostUsefulProcessingFlowHopProps {
	listEl: HTMLOListElement;
	hopLines: string[];
	tooltipText: string;
	/** False on the last card so the row does not end with an arrow. */
	hasLeavingArrow: boolean;
}

/** Adds one route card and the arrow that leaves it. */
function appendAlmostUsefulProcessingFlowHop(props: AlmostUsefulProcessingFlowHopProps): void {
	const stepEl = props.listEl.createEl('li', { cls: 'ddc_ink_almostuseful-processing-flow-step' });
	const chipEl = stepEl.createSpan({ cls: 'ddc_ink_almostuseful-processing-flow-chip' });
	chipEl.setAttr('tabindex', '0');
	const nameEl = chipEl.createSpan({ cls: 'ddc_ink_almostuseful-processing-flow-name' });
	for (const hopLine of props.hopLines) {
		// Each phrase is its own line so every card is two lines tall.
		nameEl.createSpan({
			cls: 'ddc_ink_almostuseful-processing-flow-line',
			text: hopLine,
		});
	}
	bindAlmostUsefulProcessingFlowTooltip({
		nodeEl: chipEl,
		tooltipText: props.tooltipText,
	});

	if (!props.hasLeavingArrow) return;
	// The arrow stays inside this flex item so a wrap breaks before the next card, not before the arrow.
	const connectorEl = stepEl.createSpan({ cls: 'ddc_ink_almostuseful-processing-flow-connector' });
	const arrowEl = connectorEl.createSpan({
		cls: 'ddc_ink_almostuseful-processing-flow-arrow',
		text: '→',
	});
	arrowEl.setAttr('aria-hidden', 'true');
}

/** Round-trip diagram of a handwriting SVG, plus the retention line. */
function handwritingTranscriptionProcessingDataSettingDesc(): DocumentFragment {
	const frag = createFragment();
	const descEl = createDiv();
	const routeEl = descEl.createEl('ol', { cls: 'ddc_ink_almostuseful-processing-flow' });

	appendAlmostUsefulProcessingFlowHop({
		listEl: routeEl,
		hopLines: ['Your', 'device'],
		tooltipText: 'This device, where Ink sends the handwriting SVG from.',
		hasLeavingArrow: true,
	});
	appendAlmostUsefulProcessingFlowHop({
		listEl: routeEl,
		hopLines: ['Almost', 'Useful'],
		tooltipText: 'Almost Useful\'s servers. The SVG passes through here and is not kept.',
		hasLeavingArrow: true,
	});
	appendAlmostUsefulProcessingFlowHop({
		listEl: routeEl,
		hopLines: ['OpenRouter and', 'AI model provider'],
		tooltipText: 'OpenRouter passes the SVG to the AI model provider to read the handwriting. This is based on the backend setup at the time this version of the plugin was released. Setup may be slightly different in newer versions.',
		hasLeavingArrow: true,
	});
	appendAlmostUsefulProcessingFlowHop({
		listEl: routeEl,
		hopLines: ['Almost', 'Useful'],
		tooltipText: 'The transcript passes back through Almost Useful\'s servers and is not kept there.',
		hasLeavingArrow: true,
	});
	appendAlmostUsefulProcessingFlowHop({
		listEl: routeEl,
		hopLines: ['Your', 'device'],
		tooltipText: 'The transcript returns here and is saved in the SVG file and in Markdown notes it is embedded in.',
		hasLeavingArrow: false,
	});

	const retentionEl = descEl.createSpan({ cls: 'ddc_ink_almostuseful-processing-data-retention' });
	retentionEl.setText('Almost Useful does not store the SVG or transcript on its servers after processing.');

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

export interface InsertTranscriptionBatchSectionOptions {
	contentEl: HTMLElement;
}

/**
 * Batch transcribe buttons, one per ink type.
 *
 * Lives under the account section because a batch run spends credits, so it must be next
 * to the usage charts where the user can see what is left before committing.
 */
export function insertTranscriptionBatchSection(
	options: InsertTranscriptionBatchSectionOptions,
	openBatchScopeModal: (fileType: HandwritingTranscriptionFileType) => void,
): void {
	const cardEl = options.contentEl.createDiv(
		'ddc_ink_almostuseful-settings-card ddc_ink_almostuseful-transcription-batch',
	);
	cardEl.createDiv({
		cls: 'ddc_ink_almostuseful-settings-card-title',
		text: 'Batch transcribe',
	});
	cardEl.createEl('p', {
		cls: 'ddc_ink_almostuseful-muted',
		text: 'Transcribe writing or drawings across the whole vault. Files queue up and run one at a time.',
	});

	const actionsEl = cardEl.createDiv('ddc_ink_almostuseful-transcription-batch-actions');
	insertBatchButton(actionsEl, 'Transcribe all writing', () => {
		openBatchScopeModal('inkWriting');
	});
	insertBatchButton(actionsEl, 'Transcribe all drawings', () => {
		openBatchScopeModal('inkDrawing');
	});
}

/** One secondary batch button; kept plain so the account card keeps its own styling. */
function insertBatchButton(
	parentEl: HTMLElement,
	label: string,
	onClick: () => void,
): void {
	const buttonEl = parentEl.createEl('button', {
		cls: 'ddc_ink_almostuseful-transcription-batch-btn',
		text: label,
		type: 'button',
	});
	buttonEl.addEventListener('click', onClick);
}

/** Disables the control and swaps the label so a click is visible before the code card replaces it. */
function setAlmostUsefulLinkAccountButtonBusy(button: ButtonComponent, isBusy: boolean): void {
	button.setDisabled(isBusy);
	button.buttonEl.toggleClass('is-busy', isBusy);
	const labelEl = button.buttonEl.querySelector('.ddc_ink_almostuseful-link-account-btn-label');
	if (!labelEl) return;
	labelEl.textContent = isBusy ? 'Getting code…' : 'Link account';
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
	const checkingEl = cardEl.createEl('p', {
		cls: 'ddc_ink_almostuseful-handoff-checking',
		text: "Waiting for your authorisation on the website.\nThis screen will update automatically a few seconds after that's given.",
	});
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
		checkingEl.toggleClass('is-hidden', isCodeExpired);
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
		// Open the portal only after clipboard success so the code is on the pasteboard before the browser steals focus.
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
		renewEl.disabled = true;
		renewEl.addClass('is-busy');
		void requestAlmostUsefulDeviceCode()
			.then((result) => {
				isRenewing = false;
				renewEl.disabled = false;
				renewEl.removeClass('is-busy');
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
			})
			.catch(() => {
				isRenewing = false;
				renewEl.disabled = false;
				renewEl.removeClass('is-busy');
				new Notice('Could not start Almost Useful sign-in. Try again.');
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
