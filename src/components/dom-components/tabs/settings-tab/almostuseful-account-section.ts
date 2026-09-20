import { Notice, setIcon, Setting, type ButtonComponent, type TextComponent } from 'obsidian';
import InkPlugin from 'src/main';
import { fetchAlmostUsefulBurndown } from 'src/logic/almostuseful/almostuseful-usage';
import {
	readAlmostUsefulUsageCache,
	writeAlmostUsefulUsageCache,
} from 'src/logic/almostuseful/almostuseful-usage-cache';
import { renderAlmostUsefulPoolUsageCharts } from 'src/logic/almostuseful/almostuseful-usage-charts';
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

	const wrapperEl = containerEl.createDiv('ddc_ink_section-wrapper');
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
			contentEl.createEl('p', {
				text: 'Confirm in your browser, then paste the code from the website here.',
			});
			insertPasteHandoffCode(contentEl, onRerender);
		} else {
			contentEl.createEl('p', {
				text: 'You’ll sign in in your browser. Ink never asks for your Almost Useful password.',
			});
			new Setting(contentEl)
				.setClass('ddc_ink_bare-setting')
				.setClass('ddc_ink_bare-setting--left')
				.addButton((button) => {
					button.setButtonText('Log in with Almost Useful').setCta();
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
		const createEl = contentEl.createEl('p');
		createEl.createEl('a', {
			text: 'Create an account',
			href: `${portalOrigin}/auth/sign-up`,
			attr: { target: '_blank', rel: 'noopener' },
		});
		createEl.appendText(' · ');
		createEl.createEl('a', {
			text: 'Forgot password',
			href: `${portalOrigin}/auth/forgot-password`,
			attr: { target: '_blank', rel: 'noopener' },
		});
		return;
	}

	new Setting(contentEl)
		.setClass('ddc_ink_bare-setting')
		.setClass('ddc_ink_bare-setting--left')
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

function almostUsefulAccountSectionTitle(session: AlmostUsefulSession | null): string {
	if (!session) return 'Almost Useful account';
	const identity = session.userEmail;
	if (identity) return `Almost Useful account: logged in as ${identity}`;
	return 'Almost Useful account: logged in';
}

/** Paste the continue-page code into the window that started Log in. */
function insertPasteHandoffCode(contentEl: HTMLElement, onRerender: () => void): void {
	let pastedCode = '';
	let isConnecting = false;
	let codeText: TextComponent | undefined;
	let connectButton: ButtonComponent | undefined;
	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setName('Paste authorisation code')
		.setDesc(
			'Copy the code from the website, then paste it here and tap Connect.',
		)
		.addText((text) => {
			codeText = text;
			text.setPlaceholder('Code from the website');
			text.onChange((value) => {
				pastedCode = value;
			});
		})
		.addButton((button) => {
			connectButton = button;
			button.setButtonText('Connect');
			button.setCta();
			button.onClick(() => {
				if (isConnecting) return;
				isConnecting = true;
				codeText?.setDisabled(true);
				connectButton?.setDisabled(true);
				connectButton?.setButtonText('Connecting…');
				void completeAlmostUsefulPastedHandoffCode(pastedCode).then((result) => {
					if (!result.ok) {
						isConnecting = false;
						codeText?.setDisabled(false);
						connectButton?.setDisabled(false);
						connectButton?.setButtonText('Connect');
						new Notice(result.error);
						return;
					}
					onRerender();
				});
			});
		})
		.addButton((button) => {
			button.setButtonText('Cancel pending login');
			button.onClick(() => {
				cancelAlmostUsefulPendingLogin();
				onRerender();
			});
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

	const toolbarEl = hostEl.createDiv('ddc_ink_almostuseful-usage-toolbar');
	const refreshButtonEl = toolbarEl.createEl('button', {
		cls: 'clickable-icon ddc_ink_almostuseful-refresh',
		attr: { type: 'button', 'aria-label': 'Refresh credit usage' },
	});
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
		for (const pool of pools) {
			const poolEl = chartsHostEl.createDiv('ddc_ink_almostuseful-pool');
			renderAlmostUsefulPoolUsageCharts(poolEl, pool, plotWidth);
		}
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
