import { Editor, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from 'src/types/PluginSettings';
import { registerSettingsTab } from './tabs/settings-tab/settings-tab';
import {registerWritingEmbed} from './extensions/widgets/writing-embed-widget'
import insertExistingWritingFile from './commands/insert-existing-writing-file';
import insertNewWritingFile from './commands/insert-new-writing-file';
import { registerWritingView } from './views/writing-view';
import insertNewDrawingFile from './commands/insert-new-drawing-file';
import insertExistingDrawingFile from './commands/insert-existing-drawing-file';
import { registerDrawingView } from './views/drawing-view';
import { registerDrawingEmbed } from './extensions/widgets/drawing-embed-widget';
import createNewWritingFile from './commands/create-new-writing-file';
import { openInkFile } from './utils/open-file';
import createNewDrawingFile from './commands/create-new-drawing-file';
import insertRecentlyDuplicatedDrawingFile from './commands/insert-recently-duplicated-drawing-file';
import insertRecentlyDuplicatedWritingFile from './commands/insert-recently-duplicated-writing-file';

////////
////////

export default class InkPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		// NOTE: For testing only
		// this.app.emulateMobile(false);
		// implementHandwrittenNoteAction(this)
		// implementHandDrawnNoteAction(this)

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
	// plugin.addCommand({
	// 	id: 'insert-recently-duplicated-writing',
	// 	name: 'Insert recently duplicated handwriting section',
	// 	editorCallback: (editor: Editor) => insertRecentlyDuplicatedWritingFile(plugin, editor)
	// });
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
	// plugin.addCommand({
	// 	id: 'insert-recently-duplicated-drawing',
	// 	name: 'Insert recently duplicated drawing',
	// 	editorCallback: (editor: Editor) => insertRecentlyDuplicatedDrawingFile(plugin, editor)
	// });
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