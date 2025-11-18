import './ddc-library/settings-styles.scss';
import { Editor, Notice, Plugin, addIcon } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from 'src/types/plugin-settings';
import { registerSettingsTab } from './components/dom-components/tabs/settings-tab/settings-tab';
import { registerWritingEmbed_v1 } from './components/formats/v1-code-blocks/drawing/widgets/writing-embed-widget'
import { insertExistingWritingFile } from './commands/insert-existing-writing-file';
import { insertNewWritingFile_v1 } from './commands/insert-new-writing-file-v1';
import { insertNewWritingFile } from './commands/insert-new-writing-file';
import { registerWritingView_v1 } from './components/formats/v1-code-blocks/writing/writing-view/writing-view';
import { insertNewDrawingFile_v1 } from './commands/insert-new-drawing-file-v1';
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
import { setGlobals } from './stores/global-store';
import { insertRememberedWritingFile_v1 } from './commands/insert-remembered-writing-file-v1';
import { insertExistingWritingFile_v1 } from './commands/insert-existing-writing-file-v1';
import { insertExistingDrawingFile_v1 } from './commands/insert-existing-drawing-file-v1';
import { insertRememberedDrawingFile_v1 } from './commands/insert-remembered-drawing-file-v1';
import { insertRememberedDrawingFile } from './commands/insert-remembered-drawing-file';
import { insertRememberedWritingFile } from './commands/insert-remembered-writing-file';
import { registerWritingView } from './components/formats/current/writing/writing-view/writing-view';
import { registerDrawingView } from './components/formats/current/drawing/drawing-view/drawing-view';

////////
////////

export default class InkPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		setGlobals({
			plugin: this,
		})

		addIcon('bluesky', blueskySvgStr);
		addIcon('mastodon', mastodonSvgStr);
		addIcon('threads', threadsSvgStr);
		addIcon('twitter', twitterSvgStr);

		//: NOTE: For testing only
		// this.app.emulateMobile(true);	// Use this as true or false in console to switch
		// implementHandwrittenNoteAction(this)
		// implementHandDrawnNoteAction(this)

		if (this.settings.writingEnabled) {

			// Current
			registerWritingView(this);
			registerWritingEmbed(this);
			implementWritingEmbedActions(this);
			
			// Legacy v1's are on to allow displaying, but not creating
			registerWritingView_v1(this);
			registerWritingEmbed_v1(this);
			// implementWritingEmbedActions_v1(this);
		}
		
		if (this.settings.drawingEnabled) {

			// Current
			registerDrawingView(this);
			registerDrawingEmbed(this);
			implementDrawingEmbedActions(this);

			// Legacy v1's are on to allow displaying, but not creating
			registerDrawingView_v1(this);
			registerDrawingEmbed_v1(this);
			// implementDrawingEmbedActions_v1(this);
		}

		// Register a single generic embed orchestrator if either format is enabled
		if (this.settings.writingEnabled || this.settings.drawingEnabled) {
			const { inkEmbedsExtension } = await import('./components/formats/current/ink-embeds-extension/ink-embeds-extension');
			this.registerEditorExtension([inkEmbedsExtension()]);
		}

		registerSettingsTab(this);

		// // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// // Using this function will automatically remove the event listener when this plugin is disabled.
		// // this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// // 	console.log('click', evt);
		// // });

		showOnboardingTips_maybe(this);

	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async resetSettings() {
		this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
		this.saveSettings();
		new Notice('Ink plugin settings reset');
	}
}

export const inkPluginAtom = atom<InkPlugin>();

function implementWritingEmbedActions(plugin: InkPlugin) {

	// Current
	plugin.addCommand({
		id: 'create-handwritten-section',
		name: 'New handwriting section',
		icon: 'signature',
		editorCallback: (editor: Editor) => insertNewWritingFile(plugin, editor)
	});
	plugin.addCommand({
		id: 'insert-copied-handwriting',
		name: 'Copied handwriting section',
		icon: 'clipboard-pen',
		editorCallback: (editor: Editor) => insertRememberedWritingFile(plugin, editor)
	});
	plugin.addCommand({
		id: 'embed-writing-file',
		name: 'Existing handwriting section',
		icon: 'folder-pen',
		editorCallback: (editor: Editor) => insertExistingWritingFile(plugin, editor)
	});

}
function implementWritingEmbedActions_v1(plugin: InkPlugin) {

	// Legacy
	plugin.addCommand({
		id: 'create-handwritten-section-v1',
		name: 'New handwriting section (Legacy)',
		icon: 'signature',
		editorCallback: (editor: Editor) => insertNewWritingFile_v1(plugin, editor)
	});
	plugin.addCommand({
		id: 'insert-copied-writing-v1',
		name: 'Copied handwriting section (Legacy)',
		icon: 'clipboard-pen',
		editorCallback: (editor: Editor) => insertRememberedWritingFile_v1(plugin, editor)
	});
	plugin.addCommand({
		id: 'embed-writing-file-v1',
		name: 'Existing handwriting section (Legacy)',
		icon: 'folder-pen',
		editorCallback: (editor: Editor) => insertExistingWritingFile_v1(plugin, editor)
	});

}

function implementDrawingEmbedActions(plugin: InkPlugin) {

	// Current
	plugin.addCommand({
		id: 'create-drawing-section',
		name: 'New drawing',
		icon: 'shapes',
		editorCallback: (editor: Editor) => insertNewDrawingFile(plugin, editor)
	});
	plugin.addCommand({
		id: 'insert-copied-drawing',
		name: 'Copied drawing',
		icon: 'clipboard-pen-line',
		editorCallback: (editor: Editor) => insertRememberedDrawingFile(plugin, editor)
	});
	plugin.addCommand({
		id: 'embed-drawing-file',
		name: 'Existing drawing',
		icon: 'folder-dot',
		editorCallback: (editor: Editor) => insertExistingDrawingFile(plugin, editor)
	});

}

function implementDrawingEmbedActions_v1(plugin: InkPlugin) {
	
	// Legacy
	plugin.addCommand({
		id: 'create-drawing-section-v1',
		name: 'New drawing (Legacy)',
		icon: 'shapes',
		editorCallback: (editor: Editor) => insertNewDrawingFile_v1(plugin, editor)
	});
	plugin.addCommand({
		id: 'insert-copied-drawing-v1',
		name: 'Copied drawing (Legacy)',
		icon: 'clipboard-pen-line',
		editorCallback: (editor: Editor) => insertRememberedDrawingFile_v1(plugin, editor)
	});
	plugin.addCommand({
		id: 'embed-drawing-file-v1',
		name: 'Existing drawing (Legacy)',
		icon: 'folder-dot',
		editorCallback: (editor: Editor) => insertExistingDrawingFile_v1(plugin, editor)
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