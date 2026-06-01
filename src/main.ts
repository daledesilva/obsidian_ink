import './ddc-library/settings-styles.scss';
import { App, Editor, Notice, Platform, Plugin, addIcon } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from 'src/types/plugin-settings';
import { registerSettingsTab } from './components/dom-components/tabs/settings-tab/settings-tab';
import { registerWritingEmbed_v1 } from './components/formats/v1-code-blocks/drawing/widgets/writing-embed-widget'
import { insertExistingWritingFile } from './commands/insert-existing-writing-file';
import { insertNewWritingFile } from './commands/insert-new-writing-file';
import { registerWritingView_v1 } from './components/formats/v1-code-blocks/writing/writing-view/writing-view';
import { insertExistingDrawingFile } from './commands/insert-existing-drawing-file';
import { registerDrawingView_v1 } from './components/formats/v1-code-blocks/drawing/drawing-view/drawing-view';
import { registerDrawingEmbed_v1 } from './components/formats/v1-code-blocks/drawing/widgets/drawing-embed-widget';
import { insertNewDrawingFile } from './commands/insert-new-drawing-file';
import { showWelcomeTips_maybe } from './components/dom-components/welcome-notice';
import { blueskySvgStr, mastodonSvgStr, threadsSvgStr, twitterSvgStr } from './graphics/social-icons/social-icons';
import { showVersionNotice } from './components/dom-components/version-notices';
import { atom } from 'jotai';
import { drawingEmbedExtension, registerDrawingEmbed } from './components/formats/current/drawing/drawing-embed-extension/drawing-embed-extension';
import { registerWritingEmbed, writingEmbedExtension } from './components/formats/current/writing/writing-embed-extension/writing-embed-extension';
import { registerPasteEmbedHandler } from './components/formats/current/utils/paste-embed-handler';
import { setGlobals } from './stores/global-store';
import { registerWritingView } from './components/formats/current/writing/writing-view/writing-view';
import { registerDrawingView } from './components/formats/current/drawing/drawing-view/drawing-view';
import { MigrationModal } from './components/dom-components/modals/migration-modal/migration-modal';
import { TldrawSvgMigrationModal } from './components/dom-components/modals/tldraw-svg-migration-modal/tldraw-svg-migration-modal';
import { FileConversionModal } from './components/dom-components/modals/file-conversion-modal/file-conversion-modal';
import { findNotesContainingFileEmbed, executeFileConversion, removeAllEmbedsOfFileFromNote } from './logic/utils/convert-file-embeds';
import { openRemoveEmbedFlow } from './logic/utils/remove-embed-flow';
import { RemoveEmbedModal } from './components/dom-components/modals/remove-embed-modal/remove-embed-modal';
import { registerUnifiedUndoRedo } from './logic/undo-redo/keyboard-handler';
import { registerUnifiedUndoRedoCommands } from './logic/undo-redo/unified-commands';
import { drawDefaultSvgStr, writeDefaultSvgStr, writeExistingSvgStr, writePasteSvgStr, drawExistingSvgStr, drawPasteSvgStr } from './graphics/icons/command-icons';
import { BooxConnection } from 'src/connections/boox/boox-connection';
import { migrateOutdatedSettings } from 'src/types/plugin-settings-migrations';
import { logToVault } from 'src/logic/utils/log-to-vault';
import { setDominantHand } from 'src/stores/dominant-hand-store';

////////
////////

export default class InkPlugin extends Plugin {
	settings: PluginSettings;

	/** Boox companion app WebSocket: open only while a drawing editor is active (unlocked). */
	booxConnection: BooxConnection;

	/** Sidebar collapsed state captured before opening a dedicated ink view, restored on close. */
	inkViewSidebarState: { leftWasCollapsed: boolean; rightWasCollapsed: boolean } | null = null;

	// Exposed for e2e testing
	readonly FileConversionModal = FileConversionModal;
	readonly findNotesContainingFileEmbed = findNotesContainingFileEmbed;
	readonly executeFileConversion = executeFileConversion;
	readonly RemoveEmbedModal = RemoveEmbedModal;
	readonly removeAllEmbedsOfFileFromNote = removeAllEmbedsOfFileFromNote;
	readonly openRemoveEmbedFlow = openRemoveEmbedFlow;

	openMigrationModal() {
		new MigrationModal(this).open();
	}

	openTldrawSvgMigrationModal() {
		new TldrawSvgMigrationModal(this).open();
	}

	async onload() {
		await this.loadSettings();

		this.booxConnection = new BooxConnection(() => ({
			booxConnectionEnabled: this.settings.booxConnectionEnabled,
		}));

		setGlobals({
			plugin: this,
		});

		logToVault(`Plugin loaded. writing=${this.settings.writingEnabled}, drawing=${this.settings.drawingEnabled}, boox=${this.settings.booxConnectionEnabled}`);

		addIcon('write_default', writeDefaultSvgStr);
		addIcon('write_existing', writeExistingSvgStr);
		addIcon('write_paste', writePasteSvgStr);

		addIcon('draw_default', drawDefaultSvgStr);
		addIcon('draw_existing', drawExistingSvgStr);
		addIcon('draw_paste', drawPasteSvgStr);

		addIcon('bluesky', blueskySvgStr);
		addIcon('mastodon', mastodonSvgStr);
		addIcon('threads', threadsSvgStr);
		addIcon('twitter', twitterSvgStr);

		//: NOTE: For testing only
		// this.app.emulateMobile(true);	// Use this as true or false in console to switch
		// implementHandwrittenNoteAction(this)
		// implementHandDrawnNoteAction(this)
		type InkWindowWithOptionalProcessEnv = Window & {
			process?: { env?: Record<string, string | undefined> };
		};
		const inkProcessEnv = (window as InkWindowWithOptionalProcessEnv).process?.env;
		const emulateMobileRequested = inkProcessEnv?.INK_EMULATE_MOBILE === 'true';
		const mobileEmulationReloadGuardKey = '__inkMobileEmulationReloadInProgress';
		type AppWithOptionalMobileEmulation = App & {
			emulateMobile?: (enabled: boolean) => void;
			isMobile?: boolean;
		};
		const appWithMobileEmulation = this.app as AppWithOptionalMobileEmulation;
		const canEmulateMobile = typeof appWithMobileEmulation.emulateMobile === 'function';
		const alreadyInMobileMode = !!(Platform.isMobile || Platform.isMobileApp || appWithMobileEmulation.isMobile);
		const mobileEmulationReloadInProgress = window.localStorage.getItem(mobileEmulationReloadGuardKey) === 'true';

		if (emulateMobileRequested && canEmulateMobile && !alreadyInMobileMode && !mobileEmulationReloadInProgress) {
			// emulateMobile(true) can reload the app; guard to avoid repeatedly requesting emulation on each reload.
			window.localStorage.setItem(mobileEmulationReloadGuardKey, 'true');
			const runEmulateMobile = appWithMobileEmulation.emulateMobile;
			if (typeof runEmulateMobile === 'function') {
				runEmulateMobile(true);
			}
			return;
		}

		// Once emulation is active (or not requested), clear the guard for future sessions.
		if (!emulateMobileRequested || alreadyInMobileMode) {
			window.localStorage.removeItem(mobileEmulationReloadGuardKey);
		}

		if (this.settings.writingEnabled) {

			// Current
			registerWritingView(this);
			registerWritingEmbed(this);
			registerUnifiedUndoRedo(this);
			registerUnifiedUndoRedoCommands(this);
			implementWritingEmbedCommands(this);
			
			// Legacy v1's are on to allow displaying, but not creating
			registerWritingView_v1(this);
			registerWritingEmbed_v1(this);
			// implementWritingEmbedCommandimplementWritingEmbedCommands_v1(this); s_v1(this);
		}
		
		if (this.settings.drawingEnabled) {

			// Current
			registerDrawingView(this);
			registerDrawingEmbed(this);
			if (!this.settings.writingEnabled) registerUnifiedUndoRedo(this);
			if (!this.settings.writingEnabled) registerUnifiedUndoRedoCommands(this);
			implementDrawingEmbedCommands(this);

			// Legacy v1's are on to allow displaying, but not creating
			registerDrawingView_v1(this);
			registerDrawingEmbed_v1(this);
			// implementDrawingEmbedCommands_v1(this);
		}

		// Register a single generic embed orchestrator if either format is enabled
		if (this.settings.writingEnabled || this.settings.drawingEnabled) {
			const { inkEmbedsExtension } = await import('./components/formats/current/ink-embeds-extension/ink-embeds-extension');
			this.registerEditorExtension([inkEmbedsExtension()]);
			registerPasteEmbedHandler(this);
		}

		registerSettingsTab(this);

		// // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// // Using this function will automatically remove the event listener when this plugin is disabled.
		// // this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// // 	console.log('click', evt);
		// // });

		showOnboardingTips_maybe(this);

	}

	onunload() {
		logToVault('Plugin unloaded');
		this.booxConnection?.dispose();
	}

	async loadSettings() {
		const loaded = await this.loadData() as Record<string, unknown> | null;
		const isNewInstall = !loaded || Object.keys(loaded).length === 0;
		if (isNewInstall) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS);
		} else {
			this.settings = migrateOutdatedSettings(loaded);
			await this.saveSettings();
		}
		setDominantHand(this.settings.dominantHand);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async resetSettings() {
		this.settings = structuredClone(DEFAULT_SETTINGS);
		setDominantHand(this.settings.dominantHand);
		await this.saveSettings();
		new Notice('Ink plugin settings reset');
	}
}

export const inkPluginAtom = atom<InkPlugin>();

function implementWritingEmbedCommands(plugin: InkPlugin) {

	// Current
	plugin.addCommand({
		id: 'create-handwritten-section',
		name: 'New handwriting section',
		icon: 'write_default',
		editorCallback: (editor: Editor) => insertNewWritingFile(plugin, editor)
	});
	plugin.addCommand({
		id: 'embed-writing-file',
		name: 'Existing handwriting section',
		icon: 'write_existing',
		editorCallback: (editor: Editor) => insertExistingWritingFile(plugin, editor)
	});
}

function implementDrawingEmbedCommands(plugin: InkPlugin) {

	// Current
	plugin.addCommand({
		id: 'create-drawing-section',
		name: 'New drawing',
		icon: 'draw_default',
		editorCallback: (editor: Editor) => insertNewDrawingFile(plugin, editor)
	});
	plugin.addCommand({
		id: 'embed-drawing-file',
		name: 'Existing drawing',
		icon: 'folder-dot',
		editorCallback: (editor: Editor) => insertExistingDrawingFile(plugin, editor)
	});

}

// function implementHandwrittenNoteAction(plugin: InkPlugin) {
// 	plugin.addCommand({
// 		id: 'create-writing-file',
// 		name: 'Create new handwritten note',
// 		callback: async () => {
// 			const fileRef = await createNewWritingFile(plugin);
// 			openInkFile(plugin, fileRef);
// 		}
// 	});
// 	plugin.addRibbonIcon("pencil", "New handwritten note", async () => {
// 		const fileRef = await createNewWritingFile(plugin);
// 		openInkFile(plugin, fileRef);
// 	});
// }

// function implementHandDrawnNoteAction(plugin: InkPlugin) {
// 	plugin.addCommand({
// 		id: 'create-drawing-file',
// 		name: 'Create new drawing',
// 		callback: async () => {
// 			const fileRef = await createNewDrawingFile(plugin);
// 			openInkFile(plugin, fileRef);
// 		}
// 	});
// 	plugin.addRibbonIcon("pencil", "New hand drawn note", async () => {
// 		const fileRef = await createNewDrawingFile(plugin);
// 		openInkFile(plugin, fileRef);
// 	});
// }

function showOnboardingTips_maybe(plugin: InkPlugin) {
	const newInstall = showWelcomeTips_maybe(plugin);

	if (!newInstall) {
		showVersionNotice(plugin);
	}
}