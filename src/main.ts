import './ddc-library/settings-styles.scss';
import { Editor, Notice, Plugin, addIcon } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from 'src/types/plugin-settings';
import { registerSettingsTab } from './tabs/settings-tab/settings-tab';
import {registerWritingEmbed} from './extensions/widgets/writing-embed-widget'
import insertExistingWritingFile from './commands/insert-existing-writing-file';
import insertNewWritingFile from './commands/insert-new-writing-file';
import { registerWritingView } from './views/writing-view';
import insertNewDrawingFile from './commands/insert-new-drawing-file';
import insertExistingDrawingFile from './commands/insert-existing-drawing-file';
import { registerDrawingView } from './views/drawing-view';
import { registerDrawingEmbed } from './extensions/widgets/drawing-embed-widget';
import insertRememberedDrawingFile from './commands/insert-remembered-drawing-file';
import insertRememberedWritingFile from './commands/insert-remembered-writing-file';
import { showWelcomeTips_maybe } from './notices/welcome-notice';
import { blueskySvgStr, mastodonSvgStr, threadsSvgStr, twitterSvgStr } from './graphics/social-icons/social-icons';
import * as semver from "semver";
import { showVersionNotice, show_0_2_4_changes } from './notices/version-notices';
import createNewDrawingFile from './commands/create-new-drawing-file';
import { openInkFile } from './utils/open-file';

////////
////////

export default class InkPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		addIcon('bluesky', blueskySvgStr);
		addIcon('mastodon', mastodonSvgStr);
		addIcon('threads', threadsSvgStr);
		addIcon('twitter', twitterSvgStr);

		// NOTE: For testing only
		// this.app.emulateMobile(true);	// Use this as true or false in console to switch
		// implementHandwrittenNoteAction(this)
		implementHandDrawnNoteAction(this)

		if(this.settings.writingEnabled) {
			registerWritingView(this);
			registerWritingEmbed(this);
			implementWritingEmbedActions(this);
		}
		
		if(this.settings.drawingEnabled) {
			registerDrawingView(this);
			registerDrawingEmbed(this);		
			implementDrawingEmbedActions(this);
		}
		
		registerSettingsTab(this);
		
		// // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// // Using this function will automatically remove the event listener when this plugin is disabled.
		// // this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// // 	console.log('click', evt);
		// // });

		showOnboardingTips_maybe(this);
	}
	
	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async resetSettings() {
		this.settings = JSON.parse( JSON.stringify(DEFAULT_SETTINGS) );
		this.saveSettings();
		new Notice('Ink plugin settings reset');
	}
}

function implementWritingEmbedActions(plugin: InkPlugin) {
	plugin.addCommand({
		id: 'create-handwritten-section',
		name: 'Insert new handwriting section',
		editorCallback: (editor: Editor) => insertNewWritingFile(plugin, editor)
	});
	plugin.addCommand({
		id: 'embed-writing-file',
		name: 'Insert existing handwriting section',
		editorCallback: (editor: Editor) => insertExistingWritingFile(plugin, editor)
	});
	plugin.addCommand({
		id: 'insert-copied-writing',
		name: 'Insert copied handwriting section',
		editorCallback: (editor: Editor) => insertRememberedWritingFile(plugin, editor)
	});
}

function implementDrawingEmbedActions(plugin: InkPlugin) {
	plugin.addCommand({
		id: 'create-drawing-section',
		name: 'Insert new drawing section',
		editorCallback: (editor: Editor) => insertNewDrawingFile(plugin, editor)
	});
	plugin.addCommand({
		id: 'embed-drawing-file',
		name: 'Insert existing drawing section',
		editorCallback: (editor: Editor) => insertExistingDrawingFile(plugin, editor)
	});
	plugin.addCommand({
		id: 'insert-copied-drawing',
		name: 'Insert copied drawing',
		editorCallback: (editor: Editor) => insertRememberedDrawingFile(plugin, editor)
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

function implementHandDrawnNoteAction(plugin: InkPlugin) {
	plugin.addCommand({
		id: 'create-drawing-file',
		name: 'Create new drawing',
		callback: async () => {
			const fileRef = await createNewDrawingFile(plugin);
			openInkFile(plugin, fileRef);
		}
	});
	plugin.addRibbonIcon("pencil", "New hand drawn note", async () => {
		const fileRef = await createNewDrawingFile(plugin);
		openInkFile(plugin, fileRef);
	});
}

function showOnboardingTips_maybe(plugin: InkPlugin) {
	const newInstall = showWelcomeTips_maybe(plugin);

	if(!newInstall) {
		showVersionNotice(plugin);
	}
}