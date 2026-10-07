import fs from 'fs';
import path from 'path';
import { setGlobals } from 'src/stores/global-store';
import {
	INK_WORKSPACE_CHROME_HIDDEN_CLASS,
	applyPendingInkWorkspaceChromeHide,
	cancelPendingInkWorkspaceChromeHide,
	enterInkWorkspaceChromeHidden,
	exitInkWorkspaceChromeHidden,
	leafHasBackHistory,
	navigateInkLeafBack,
	releaseInkWorkspaceChromeOnPluginUnload,
	requestInkWorkspaceChromeForNextDedicatedView,
	resetInkWorkspaceChromeForTests,
	shouldOfferInkWorkspaceNavigateBack,
} from 'src/logic/utils/ink-workspace-chrome';

//////////
//////////

jest.mock('src/stores/global-store', () => {
	const state: { plugin: unknown } = { plugin: null };
	return {
		__esModule: true,
		getGlobals: () => state,
		setGlobals: (globals: { plugin: unknown }) => {
			state.plugin = globals.plugin;
		},
	};
});

interface FakeSplit {
	collapsed: boolean;
	collapse: () => void;
	expand: () => void;
}

interface FakeLeaf {
	id: string;
	history: {
		backHistory: unknown[];
		back: jest.Mock;
	};
}

function installWorkspace(activeLeafId: string) {
	const leafChangeListeners: Array<() => void> = [];
	const leftSplit: FakeSplit = {
		collapsed: false,
		collapse() { this.collapsed = true; },
		expand() { this.collapsed = false; },
	};
	const rightSplit: FakeSplit = {
		collapsed: false,
		collapse() { this.collapsed = true; },
		expand() { this.collapsed = false; },
	};
	const leaves = new Map<string, FakeLeaf>();
	const workspace = {
		leftSplit,
		rightSplit,
		activeLeaf: { id: activeLeafId } as { id: string } | null,
		on(name: string, callback: () => void) {
			if (name === 'active-leaf-change') leafChangeListeners.push(callback);
			return { name };
		},
		offref() {},
		getLeafById(id: string) {
			return leaves.get(id) ?? null;
		},
		emitActiveLeafChange() {
			for (const callback of leafChangeListeners) callback();
		},
	};
	setGlobals({
		plugin: {
			app: { workspace },
			registerEvent() {},
		} as never,
	});
	return { workspace, leftSplit, rightSplit, leaves };
}

describe('ink workspace chrome', () => {
	beforeEach(() => {
		resetInkWorkspaceChromeForTests();
		document.body.className = '';
	});

	it('hides ribbon, tab strip, and view header while the ink leaf is active', () => {
		const { workspace } = installWorkspace('ink-leaf');
		const stylesheet = document.createElement('style');
		stylesheet.textContent = fs.readFileSync(
			path.join(process.cwd(), 'src/styles/ink-workspace-chrome.scss'),
			'utf8',
		);
		document.head.appendChild(stylesheet);
		const ribbon = document.createElement('div');
		ribbon.className = 'workspace-ribbon';
		const tabStrip = document.createElement('div');
		tabStrip.className = 'workspace-tab-header-container';
		const viewHeader = document.createElement('div');
		viewHeader.className = 'view-header';
		const statusBar = document.createElement('div');
		statusBar.className = 'status-bar';
		document.body.append(ribbon, tabStrip, viewHeader, statusBar);

		enterInkWorkspaceChromeHidden('ink-leaf', {
			collapseSidebars: false,
			showNavigateBack: true,
		});

		expect(document.body.classList.contains(INK_WORKSPACE_CHROME_HIDDEN_CLASS)).toBe(true);
		expect(getComputedStyle(ribbon).display).toBe('none');
		expect(getComputedStyle(tabStrip).display).toBe('none');
		expect(getComputedStyle(viewHeader).display).toBe('none');
		expect(getComputedStyle(statusBar).display).toBe('none');

		workspace.activeLeaf = { id: 'note-leaf' };
		workspace.emitActiveLeafChange();
		expect(document.body.classList.contains(INK_WORKSPACE_CHROME_HIDDEN_CLASS)).toBe(false);
		expect(getComputedStyle(ribbon).display).not.toBe('none');

		workspace.activeLeaf = { id: 'ink-leaf' };
		workspace.emitActiveLeafChange();
		expect(getComputedStyle(viewHeader).display).toBe('none');
		stylesheet.remove();
	});

	it('shifts the macOS quick menu clear of the traffic lights by two button widths', () => {
		const stylesheet = document.createElement('style');
		stylesheet.textContent = fs.readFileSync(
			path.join(process.cwd(), 'src/styles/ink-workspace-chrome.scss'),
			'utf8',
		);
		document.head.appendChild(stylesheet);
		const sheet = stylesheet.sheet;
		if (!sheet) throw new Error('stylesheet did not parse');
		const ruleText = Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
		expect(ruleText).toContain('body.mod-macos.ddc_ink_hide-workspace-chrome:not(.is-fullscreen) .ink_quick-menu');
		expect(ruleText).toContain('margin-left: calc(2 * 2.5 * var(--font-ui-small) + 8px)');
		stylesheet.remove();
	});

	it('starts full screen from an embed without restoring sidebars on exit, and offers back', () => {
		const { leftSplit, rightSplit } = installWorkspace('ink-leaf');
		leftSplit.collapsed = true;
		rightSplit.collapsed = true;
		requestInkWorkspaceChromeForNextDedicatedView();
		applyPendingInkWorkspaceChromeHide('ink-leaf');

		expect(shouldOfferInkWorkspaceNavigateBack('ink-leaf')).toBe(true);
		expect(leftSplit.collapsed).toBe(true);

		applyPendingInkWorkspaceChromeHide('ink-leaf');
		expect(shouldOfferInkWorkspaceNavigateBack('ink-leaf')).toBe(true);

		exitInkWorkspaceChromeHidden('ink-leaf');
		expect(document.body.classList.contains(INK_WORKSPACE_CHROME_HIDDEN_CLASS)).toBe(false);
		expect(shouldOfferInkWorkspaceNavigateBack('ink-leaf')).toBe(false);
		expect(leftSplit.collapsed).toBe(true);
		expect(rightSplit.collapsed).toBe(true);
	});

	it('dedicated-view full screen collapses sidebars and does not offer back', () => {
		const { leftSplit, rightSplit } = installWorkspace('ink-leaf');
		enterInkWorkspaceChromeHidden('ink-leaf', {
			collapseSidebars: true,
			showNavigateBack: false,
		});

		expect(leftSplit.collapsed).toBe(true);
		expect(rightSplit.collapsed).toBe(true);
		expect(shouldOfferInkWorkspaceNavigateBack('ink-leaf')).toBe(false);

		exitInkWorkspaceChromeHidden('ink-leaf');
		expect(leftSplit.collapsed).toBe(false);
		expect(rightSplit.collapsed).toBe(false);
	});

	it('does not let a different leaf exit this session', () => {
		installWorkspace('ink-leaf');
		enterInkWorkspaceChromeHidden('ink-leaf', {
			collapseSidebars: false,
			showNavigateBack: true,
		});
		exitInkWorkspaceChromeHidden('other-leaf');
		expect(document.body.classList.contains(INK_WORKSPACE_CHROME_HIDDEN_CLASS)).toBe(true);
	});

	it('cancels a pending embed request when the dedicated view does not open', () => {
		installWorkspace('ink-leaf');
		requestInkWorkspaceChromeForNextDedicatedView();
		cancelPendingInkWorkspaceChromeHide();
		applyPendingInkWorkspaceChromeHide('ink-leaf');
		expect(document.body.classList.contains(INK_WORKSPACE_CHROME_HIDDEN_CLASS)).toBe(false);
	});

	it('navigates back only when the leaf has history', () => {
		const { leaves } = installWorkspace('ink-leaf');
		const back = jest.fn();
		const leaf: FakeLeaf = {
			id: 'ink-leaf',
			history: { backHistory: [{ title: 'Note' }], back },
		};
		leaves.set('ink-leaf', leaf);
		expect(leafHasBackHistory(leaf as never)).toBe(true);
		navigateInkLeafBack('ink-leaf');
		expect(back).toHaveBeenCalledTimes(1);

		leaf.history.backHistory = [];
		navigateInkLeafBack('ink-leaf');
		expect(back).toHaveBeenCalledTimes(1);
	});

	it('restores sidebars captured by full screen when the plugin unloads', () => {
		const { leftSplit } = installWorkspace('ink-leaf');
		enterInkWorkspaceChromeHidden('ink-leaf', {
			collapseSidebars: true,
			showNavigateBack: false,
		});
		expect(leftSplit.collapsed).toBe(true);
		releaseInkWorkspaceChromeOnPluginUnload();
		expect(leftSplit.collapsed).toBe(false);
		expect(document.body.classList.contains(INK_WORKSPACE_CHROME_HIDDEN_CLASS)).toBe(false);
	});
});
