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
	ALMOSTUSEFUL_AUTHORIZATION_CODE_LENGTH,
	extractAlmostUsefulAuthorizationCodeInputCharacters,
	normalizeAlmostUsefulAuthorizationCode,
} from 'src/logic/almostuseful/almostuseful-authorization-code-format';
import {
	cancelAlmostUsefulPendingLogin,
	completeAlmostUsefulPastedHandoffCode,
	getAlmostUsefulLoginPhase,
	logOutAlmostUseful,
	openAlmostUsefulBrowserUrl,
	scheduleAlmostUsefulPasteUi,
	startAlmostUsefulBrowserLogin,
} from 'src/logic/almostuseful/almostuseful-login';
import {
	readAlmostUsefulHandoffPending,
	readAlmostUsefulSession,
	resolveAlmostUsefulPortalOrigin,
	type AlmostUsefulSession,
} from 'src/logic/almostuseful/almostuseful-session';
import './almostuseful-account-section.scss';

/////////
/////////

let usageChartsResizeObserver: ResizeObserver | null = null;
/** Keep expand/collapse across settings re-renders (login, session refresh). */
let isAlmostUsefulAccountSectionExpanded = true;

/** Almost Useful account block at the top of Ink settings (no password fields). */
export function insertAlmostUsefulAccountSection(
	containerEl: HTMLElement,
	_plugin: InkPlugin,
	onRerender: () => void,
): void {
	const session = readAlmostUsefulSession();
	const pending = readAlmostUsefulHandoffPending();
	const phase = getAlmostUsefulLoginPhase();
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
		if (pending || phase === 'pending') {
			insertPasteHandoffCode(contentEl, onRerender);
		} else {
			new Setting(contentEl)
				.setClass('ddc_ink_setting')
				.setClass('ddc_ink_almostuseful-link-account-setting')
				.setName('Link account')
				.setDesc(
					'Create and link an Almost Useful account to utilise handwriting transcription.',
				)
				.addButton((button) => {
					decorateAlmostUsefulLinkAccountButton(button);
					if (phase === 'opening') {
						// Same Log in row for four seconds: disable only, do not swap to paste UI.
						button.setDisabled(true);
					}
					button.onClick(() => {
						if (getAlmostUsefulLoginPhase() === 'opening') return;
						button.setDisabled(true);
						void startAlmostUsefulBrowserLogin().then(() => {
							scheduleAlmostUsefulPasteUi(onRerender);
						});
					});
				});
		}
		return;
	}

	new Setting(contentEl)
		.setClass('ddc_ink_bare-setting')
		.setClass('ddc_ink_bare-setting--left')
		.setClass('ddc_ink_button-set')
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

	const usageHostEl = contentEl.createDiv('ddc_ink_almostuseful-usage');
	void loadUsageInto(usageHostEl, session, portalOrigin);
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

interface AlmostUsefulAuthorizationCodeOtpInput {
	getCode: () => string;
	setDisabled: (isDisabled: boolean) => void;
	focus: () => void;
}

/** Six-box authorisation code entry; paste strips separators and fills every cell. */
function insertAlmostUsefulAuthorizationCodeOtpInput(
	hostEl: HTMLElement,
): AlmostUsefulAuthorizationCodeOtpInput {
	const rowEl = hostEl.createDiv('ddc_ink_almostuseful-handoff-code-row');
	rowEl.setAttribute('role', 'group');
	rowEl.setAttribute('aria-label', 'Authorisation code');

	const cellInputs: HTMLInputElement[] = [];

	const applyCharacters = (characters: string[]): void => {
		for (let index = 0; index < ALMOSTUSEFUL_AUTHORIZATION_CODE_LENGTH; index++) {
			cellInputs[index].value = characters[index] ?? '';
		}
		let focusIndex = characters.length;
		if (focusIndex >= ALMOSTUSEFUL_AUTHORIZATION_CODE_LENGTH) {
			focusIndex = ALMOSTUSEFUL_AUTHORIZATION_CODE_LENGTH - 1;
		}
		cellInputs[focusIndex].focus();
	};

	const handlePaste = (event: ClipboardEvent): void => {
		event.preventDefault();
		const pastedText = event.clipboardData?.getData('text') ?? '';
		applyCharacters(extractAlmostUsefulAuthorizationCodeInputCharacters(pastedText));
	};

	for (let index = 0; index < ALMOSTUSEFUL_AUTHORIZATION_CODE_LENGTH; index++) {
		if (index === 3) {
			rowEl.createSpan({
				cls: 'ddc_ink_almostuseful-handoff-code-separator',
				text: '-',
				attr: { 'aria-hidden': 'true' },
			});
		}

		const cellInput = rowEl.createEl('input', {
			cls: 'ddc_ink_almostuseful-handoff-code-cell',
			type: 'text',
			attr: {
				'inputmode': 'text',
				'autocomplete': 'one-time-code',
				'autocapitalize': 'characters',
				'autocorrect': 'off',
				'spellcheck': 'false',
				'maxlength': '1',
				'aria-label': `Authorisation code character ${index + 1}`,
			},
		});

		cellInput.addEventListener('paste', handlePaste);
		cellInput.addEventListener('input', () => {
			const typedCharacters = extractAlmostUsefulAuthorizationCodeInputCharacters(cellInput.value);
			if (typedCharacters.length > 1) {
				const mergedCharacters = cellInputs.map((input) => input.value);
				for (
					let offset = 0;
					offset < typedCharacters.length && index + offset < ALMOSTUSEFUL_AUTHORIZATION_CODE_LENGTH;
					offset++
				) {
					mergedCharacters[index + offset] = typedCharacters[offset];
				}
				applyCharacters(mergedCharacters);
				return;
			}

			cellInput.value = typedCharacters[0] ?? '';
			if (cellInput.value && index < ALMOSTUSEFUL_AUTHORIZATION_CODE_LENGTH - 1) {
				cellInputs[index + 1].focus();
			}
		});
		cellInput.addEventListener('keydown', (event) => {
			if (event.key !== 'Backspace') return;
			if (cellInput.value) return;
			if (index === 0) return;
			event.preventDefault();
			cellInputs[index - 1].focus();
			cellInputs[index - 1].value = '';
		});

		cellInputs.push(cellInput);
	}

	rowEl.addEventListener('paste', handlePaste);

	return {
		getCode: () => cellInputs.map((input) => input.value).join(''),
		setDisabled: (isDisabled: boolean) => {
			for (const cellInput of cellInputs) {
				cellInput.disabled = isDisabled;
			}
		},
		focus: () => {
			cellInputs[0].focus();
		},
	};
}

/** Paste the continue-page code into the window that started Log in. */
function insertPasteHandoffCode(contentEl: HTMLElement, onRerender: () => void): void {
	const cardEl = contentEl.createDiv('ddc_ink_almostuseful-handoff-card');
	cardEl.createEl('p', {
		cls: 'ddc_ink_almostuseful-handoff-instruction',
		text: 'Confirm in your browser, then paste the code from the website here.',
	});

	const codeInputEl = cardEl.createDiv('ddc_ink_almostuseful-handoff-code-input');
	const otpInput = insertAlmostUsefulAuthorizationCodeOtpInput(codeInputEl);

	const actionsEl = cardEl.createDiv('ddc_ink_almostuseful-handoff-actions');
	const cancelButtonEl = actionsEl.createEl('button', {
		cls: 'ddc_ink_almostuseful-handoff-cancel-btn',
		text: 'Cancel pending login',
		type: 'button',
	});
	const connectButtonEl = actionsEl.createEl('button', {
		cls: 'mod-cta ddc_ink_almostuseful-handoff-connect-btn',
		text: 'Connect',
		type: 'button',
	});

	let isConnecting = false;

	connectButtonEl.addEventListener('click', () => {
		if (isConnecting) return;
		isConnecting = true;
		otpInput.setDisabled(true);
		connectButtonEl.disabled = true;
		cancelButtonEl.disabled = true;
		connectButtonEl.setText('Connecting…');
		const pastedCode = normalizeAlmostUsefulAuthorizationCode(otpInput.getCode());
		void completeAlmostUsefulPastedHandoffCode(pastedCode).then((result) => {
			if (!result.ok) {
				isConnecting = false;
				otpInput.setDisabled(false);
				connectButtonEl.disabled = false;
				cancelButtonEl.disabled = false;
				connectButtonEl.setText('Connect');
				new Notice(result.error);
				otpInput.focus();
				return;
			}
			onRerender();
		});
	});

	cancelButtonEl.addEventListener('click', () => {
		cancelAlmostUsefulPendingLogin();
		onRerender();
	});

	otpInput.focus();
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
