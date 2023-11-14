import { MarkdownViewModeType, Notice, Plugin } from 'obsidian';
import { PluginSettings } from 'src/types/PluginSettings';
import { MySettingsTab } from './tabs/settings-tab/settings-tab';
import {registerHandwritingEmbed} from './extensions/embeds/handwriting-embed'
import insertExistingFile from './commands/insert-existing-file';
import insertNewFile from './commands/insert-new-file';
import { HANDWRITING_VIEW_TYPE, HandwritingView, ViewPosition, activateHandwritingView } from './views/handwriting-view';


export const DEFAULT_SETTINGS: PluginSettings = {
	
}




export default class HandwritePlugin extends Plugin {
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
		
		this.addCommand({
			id: 'ddc_embed-handwritten-file',
			name: 'Insert existing handwritten section',
			callback: () => insertExistingFile(this)
		});
		this.addCommand({
			id: 'ddc_create-handwritten-section',
			name: 'Insert new handwritten section',
			callback: () => insertNewFile(this)
		});


		this.registerView(
			HANDWRITING_VIEW_TYPE,
			(leaf) => new HandwritingView(leaf, this)
		);
	
		this.addRibbonIcon("dice", "Handwriting View (Current tab)", () => {
			activateHandwritingView(this, ViewPosition.replacement);
		});
		this.addRibbonIcon("dice", "Handwriting View (New tab)", () => {
			activateHandwritingView(this, ViewPosition.tab);
		});
		this.addRibbonIcon("dice", "Handwriting View (Split right)", () => {
			activateHandwritingView(this, ViewPosition.verticalSplit);
		});
		this.addRibbonIcon("dice", "Handwriting View (Split bottom)", () => {
			activateHandwritingView(this, ViewPosition.horizontalSplit);
		});


		
		// TODO: Convert this to registerSettingsTab
		this.addSettingTab(new MySettingsTab(this.app, this));
		
		registerHandwritingEmbed(this);

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


