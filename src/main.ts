import { Editor, MarkdownViewModeType, Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { PluginSettings } from 'src/types/PluginSettings';
import { MySettingsTab } from './tabs/settings-tab/settings-tab';
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


export const DEFAULT_SETTINGS: PluginSettings = {
	
}




export default class InkPlugin extends Plugin {
	settings: PluginSettings;

	// Function came from Notion like tables code
	private getViewMode = (el: HTMLElement): MarkdownViewModeType | null => {
		const parent = el.parentElement;
		if (parent) {
			return parent.className.includes("cm-preview-code-block")
				? "source"
				: "preview";
		}
		return null;
	};


	async onload() {
		await this.loadSettings();


		// this.app.emulateMobile(false);
		

		// Add global actions
		this.addCommand({
			id: 'ddc_create-writing-file',
			name: 'Create new handwritten note',
			callback: async () => {
				const fileRef = await createNewWritingFile(this);
				openInkFile(this, fileRef);
			}
		});
		this.addCommand({
			id: 'ddc_create-drawing-file',
			name: 'Create new drawing',
			callback: async () => {
				const fileRef = await createNewDrawingFile(this);
				openInkFile(this, fileRef);
			}
		});
		

		// Add markdown note actions
		this.addCommand({
			id: 'ddc_embed-writing-file',
			name: 'Insert existing handwriting section',
			editorCallback: (editor: Editor) => insertExistingWritingFile(this, editor)
		});
		this.addCommand({
			id: 'ddc_create-handwritten-section',
			name: 'Insert new handwriting section',
			editorCallback: (editor: Editor) => insertNewWritingFile(this, editor)
		});
		this.addCommand({
			id: 'ddc_embed-drawing-file',
			name: 'Insert existing handdrawing section',
			editorCallback: (editor: Editor) => insertExistingDrawingFile(this, editor)
		});
		this.addCommand({
			id: 'ddc_create-drawing-section',
			name: 'Insert new handdrawing section',
			editorCallback: (editor: Editor) => insertNewDrawingFile(this, editor)
		});
		this.addCommand({
			id: 'ddc_insert-recently-duplicated-drawing',
			name: 'Insert recently duplicated drawing',
			editorCallback: (editor: Editor) => insertRecentlyDuplicatedDrawingFile(this, editor)
		});


		

		registerWritingView(this);
		registerWritingEmbed(this);

		registerDrawingView(this);
		registerDrawingEmbed(this);
	
		

		this.addRibbonIcon("pencil", "New handwritten note", async () => {
			const fileRef = await createNewWritingFile(this);
			openInkFile(this, fileRef);
		});
		this.addRibbonIcon("pencil", "New hand drawn note", async () => {
			const fileRef = await createNewDrawingFile(this);
			openInkFile(this, fileRef);
		});

		// this.addRibbonIcon("dice", "Handwriting View (Current tab)", () => {
			// activateHandwritingView(this, ViewPosition.replacement);
		// });
		// this.addRibbonIcon("dice", "Handwriting View (New tab)", () => {
		// 	activateHandwritingView(this, ViewPosition.tab);
		// });
		// this.addRibbonIcon("dice", "Handwriting View (Split right)", () => {
		// 	activateHandwritingView(this, ViewPosition.verticalSplit);
		// });
		// this.addRibbonIcon("dice", "Handwriting View (Split bottom)", () => {
		// 	activateHandwritingView(this, ViewPosition.horizontalSplit);
		// });


		
		// TODO: Convert this to registerSettingsTab
		this.addSettingTab(new MySettingsTab(this.app, this));
		

		// // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// // Using this function will automatically remove the event listener when this plugin is disabled.
		// // this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// // 	console.log('click', evt);
		// // });
		

	}

	onunload() {
		// TODO: Make sure to stop anything here

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	// async saveSettings() {
	// 	await this.saveData(this.settings);
	// }

	// async resetSettings() {
	// 	this.settings = JSON.parse( JSON.stringify(DEFAULT_SETTINGS) );
	// 	this.saveSettings();
	// 	new Notice('Plugin settings reset');
	// }
}



