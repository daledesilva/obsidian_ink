import { Setting } from 'obsidian';
import InkPlugin from 'src/main';
import {
	fetchAlmostUsefulBurndown,
	fetchAlmostUsefulUsage,
	type AlmostUsefulBurndownPool,
} from 'src/logic/almostuseful/almostuseful-usage';
import {
	getAlmostUsefulLoginPhase,
	logOutAlmostUseful,
	openAlmostUsefulBrowserUrl,
	startAlmostUsefulBrowserLogin,
} from 'src/logic/almostuseful/almostuseful-login';
import {
	readAlmostUsefulDebugConfig,
	readAlmostUsefulSession,
	resolveAlmostUsefulPortalOrigin,
	writeAlmostUsefulDebugConfig,
} from 'src/logic/almostuseful/almostuseful-session';
import './almostuseful-account-section.scss';

/////////
/////////

/** Almost Useful account block at the top of Ink settings (no password fields). */
export function insertAlmostUsefulAccountSection(
	containerEl: HTMLElement,
	_plugin: InkPlugin,
	onRerender: () => void,
): void {
	const wrapperEl = containerEl.createDiv('ddc_ink_section-wrapper ddc_ink_expanded');
	const sectionEl = wrapperEl.createDiv('ddc_ink_controls-section');
	new Setting(sectionEl)
		.setClass('ddc_ink_controls-header')
		.setName('Almost Useful account');
	const contentEl = sectionEl.createDiv('ddc_ink_controls-content ddc_ink_almostuseful-account');

	const session = readAlmostUsefulSession();
	const phase = getAlmostUsefulLoginPhase();
	const portalOrigin = resolveAlmostUsefulPortalOrigin();

	if (phase === 'pending' && !session) {
		contentEl.createEl('p', {
			text: 'Finish sign-in in your browser…',
		});
		return;
	}

	if (!session) {
		contentEl.createEl('p', {
			text: 'You’ll sign in in your browser. Ink never asks for your Almost Useful password.',
		});
		new Setting(contentEl)
			.setClass('ddc_ink_setting')
			.addButton((button) => {
				button.setButtonText('Log in with Almost Useful').setCta();
				button.onClick(() => {
					void startAlmostUsefulBrowserLogin().then(() => {
						onRerender();
					});
				});
			});
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
		insertDebugOverride(contentEl, onRerender);
		return;
	}

	const identityBits: string[] = [];
	if (session.displayName) identityBits.push(session.displayName);
	if (session.email) identityBits.push(session.email);
	contentEl.createEl('p', {
		text: identityBits.join(' · ') || 'Signed in',
	});

	new Setting(contentEl)
		.setClass('ddc_ink_setting')
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
	usageHostEl.createEl('p', { text: 'Loading credits…', cls: 'ddc_ink_almostuseful-muted' });
	void loadUsageInto(usageHostEl, session, portalOrigin);

	insertDebugOverride(contentEl, onRerender);
}

/** Fetches remaining credits and a simplified burndown SVG. */
async function loadUsageInto(
	hostEl: HTMLElement,
	session: ReturnType<typeof readAlmostUsefulSession>,
	portalOrigin: string,
): Promise<void> {
	if (!session) return;
	const usage = await fetchAlmostUsefulUsage(session);
	if ('unauthorized' in usage) {
		hostEl.empty();
		hostEl.createEl('p', { text: 'Signed out.' });
		return;
	}
	hostEl.empty();
	if (!usage.hasActivePool) {
		hostEl.createEl('p', {
			text: 'No active AI credit pool. Buy credits on the website.',
		});
		new Setting(hostEl).addButton((button) => {
			button.setButtonText('Open products').setCta();
			button.onClick(() => {
				openAlmostUsefulBrowserUrl(`${portalOrigin}/account/products`);
			});
		});
		return;
	}
	let remainingCopy = 'Remaining credits unavailable';
	if (usage.creditsRemaining) {
		remainingCopy = `Remaining this period: $${usage.creditsRemaining}`;
	}
	hostEl.createEl('p', { text: remainingCopy });

	const burndown = await fetchAlmostUsefulBurndown(session);
	if ('unauthorized' in burndown) return;
	const firstPool = burndown[0];
	if (firstPool) renderSimpleUsageChart(hostEl, firstPool);
}

/** Compact SVG from burndown JSON — not an iframe of /account. */
function renderSimpleUsageChart(hostEl: HTMLElement, pool: AlmostUsefulBurndownPool): void {
	const points = pool.series?.points ?? [];
	if (!points.length) return;
	const width = 320;
	const height = 72;
	const maxRemaining = Math.max(
		...points.map((point) => point.creditsRemaining),
		1,
	);
	const svgNs = 'http://www.w3.org/2000/svg';
	const svgEl = document.createElementNS(svgNs, 'svg');
	svgEl.setAttribute('class', 'ddc_ink_almostuseful-chart');
	svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svgEl.setAttribute('width', '100%');
	svgEl.setAttribute('role', 'img');
	svgEl.setAttribute('aria-label', pool.title ?? 'Credit usage');
	points.forEach((point, index) => {
		const barWidth = width / points.length;
		const barHeight = (point.creditsRemaining / maxRemaining) * (height - 4);
		const rect = document.createElementNS(svgNs, 'rect');
		rect.setAttribute('x', String(index * barWidth + 1));
		rect.setAttribute('y', String(height - barHeight));
		rect.setAttribute('width', String(Math.max(barWidth - 2, 1)));
		rect.setAttribute('height', String(barHeight));
		rect.setAttribute('class', 'ddc_ink_almostuseful-chart-bar');
		svgEl.appendChild(rect);
	});
	hostEl.appendChild(svgEl);

	const clientNames = [
		...new Set(
			(pool.clientDailyUsage ?? [])
				.map((row) => row.clientDisplayName || row.clientId)
				.filter((name) => name.length > 0),
		),
	];
	if (clientNames.length) {
		hostEl.createEl('p', {
			cls: 'ddc_ink_almostuseful-muted',
			text: `Apps: ${clientNames.join(', ')}`,
		});
	}
}

/** Staging host override — never a place for the service role. */
function insertDebugOverride(contentEl: HTMLElement, onRerender: () => void): void {
	const detailsEl = contentEl.createEl('details');
	detailsEl.createEl('summary', { text: 'Debug portal host' });
	detailsEl.createEl('p', {
		cls: 'ddc_ink_almostuseful-muted',
		text: 'Optional staging origin plus matching public Supabase URL and anon key. Never paste a service role key.',
	});
	const debug = readAlmostUsefulDebugConfig();
	new Setting(detailsEl)
		.setName('Portal origin')
		.setDesc('Empty uses production account.almostuseful.xyz')
		.addText((text) => {
			text.setPlaceholder('https://…');
			text.setValue(debug.portalOrigin ?? '');
			text.onChange((value) => {
				writeAlmostUsefulDebugConfig({
					...readAlmostUsefulDebugConfig(),
					portalOrigin: value.trim() || undefined,
				});
			});
		});
	new Setting(detailsEl)
		.setName('Supabase URL')
		.addText((text) => {
			text.setPlaceholder('https://….supabase.co');
			text.setValue(debug.supabaseUrl ?? '');
			text.onChange((value) => {
				writeAlmostUsefulDebugConfig({
					...readAlmostUsefulDebugConfig(),
					supabaseUrl: value.trim() || undefined,
				});
			});
		});
	new Setting(detailsEl)
		.setName('Supabase anon key')
		.addText((text) => {
			text.setPlaceholder('public anon key');
			text.setValue(debug.supabaseAnonKey ?? '');
			text.onChange((value) => {
				writeAlmostUsefulDebugConfig({
					...readAlmostUsefulDebugConfig(),
					supabaseAnonKey: value.trim() || undefined,
				});
			});
		});
	new Setting(detailsEl).addButton((button) => {
		button.setButtonText('Apply debug host');
		button.onClick(() => {
			onRerender();
		});
	});
}
