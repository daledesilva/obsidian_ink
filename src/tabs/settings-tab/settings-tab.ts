import './settings-tab.scss';
import { App, PluginSettingTab, Setting } from "obsidian";
import InkPlugin from "src/main";
import MyPlugin from "src/main";
import { ConfirmationModal } from "src/modals/confirmation-modal/confirmation-modal";

/////////
/////////

export function registerSettingsTab(plugin: InkPlugin) {
	plugin.addSettingTab(new MySettingsTab(plugin.app, plugin));
}

export class MySettingsTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('p', {text: 'The Ink plugin enables embedding and editing handwritten and hand drawn sections directly in your markdown files.'});
		insertPrereleaseWarning(containerEl);

		containerEl.createEl('hr');
		insertMoreInfoLinks(containerEl);
			
		// TODO: Collapsible change log
		// containerEl.createEl('p', {
		// 	text: 'Alpha v0.0.359 changes',
		// 	cls: 'ddc_ink_text-warning',
		// });		
		
		insertGeneralSettings(containerEl, this.plugin);
		insertHighLevelSettings(containerEl, this.plugin, () => this.display());
		if(this.plugin.settings.writingEnabled)	insertWritingSettings(containerEl);
		if(this.plugin.settings.drawingEnabled)	insertDrawingSettings(containerEl);
	
		new Setting(containerEl)
			.addButton( (button) => {
				button.setButtonText('Reset settings');
				button.onClick(() => {
					new ConfirmationModal({
						plugin: this.plugin,
						title: 'Please confirm',
						message: 'Revert to default settings for Ink plugin?',
						confirmLabel: 'Reset settings',
						confirmAction: async () => {
							await this.plugin.resetSettings();
							this.display();
						}
					}).open();
				})
			})
		

	}
}

function insertGeneralSettings(containerEl: HTMLElement, plugin: InkPlugin) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_controls-section');
	sectionEl.createEl('h2', {text: 'General'});

	new Setting(sectionEl)
		.setClass('ddc_ink_setting')
		.setName('Use default attachment folder')
		.setDesc(`This will create the 'Ink' folder inside your default attachment folder defined in the 'Files and links' settings tab. Otherwise it will be at the root of your vault.`)
		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.useDefaultAttachmentFolder);
			toggle.onChange(async (value) => {
				plugin.settings.useDefaultAttachmentFolder = value;
				await plugin.saveSettings();
			});
		});

	insertSetupGuide(sectionEl);
}

function insertSetupGuide(containerEl: HTMLElement) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_setup-guide-section');
	const accordion = sectionEl.createEl('details');
	accordion.createEl('summary', { text: `Setup guide (Expand for details)` });
	accordion.createEl('p', { text: `To make this plugin more intuitive, consider using a plugin like Slash Commander to make the insert commands more easily accessible.` });
}

function insertMoreInfoLinks(containerEl: HTMLElement) {
	const sectionEl = containerEl.createDiv('ddc_ink_section');
	sectionEl.createEl('p', { text: `For information on this plugin's development, visit the links below. Feel free to leave comments in the development diaries on YouTube.` });
	const list = sectionEl.createEl('ul');
	list.createEl('li').createEl('a', {
		href: 'https://github.com/daledesilva/obsidian_ink',
		text: 'Roadmap'
	});
	list.createEl('li').createEl('a', {
		href: 'https://www.youtube.com/playlist?list=PLAiv7XV4xFx2NMRSCxdGiVombKO-TiMAL',
		text: 'Development Diaries.'
	});
	list.createEl('li').createEl('a', {
		href: 'https://github.com/daledesilva/obsidian_ink/issues',
		text: 'Request feature / Report bug.'
	});
}

function insertHighLevelSettings(containerEl: HTMLElement, plugin: InkPlugin, refresh: Function) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_controls-section');
	sectionEl.createEl('h2', {text: 'High level functionality'});

		new Setting(sectionEl)
			.setClass('ddc_ink_setting')
			.setName('Enable writing')
			.setDesc('If disabled, you will still be able to view previously created writing embeds.')
			.addToggle((toggle) => {
				toggle.setValue(plugin.settings.writingEnabled);
				toggle.onChange(async (value) => {
					plugin.settings.writingEnabled = value;
					await plugin.saveSettings();
					refresh();
				});
			});

		new Setting(sectionEl)
			.setClass('ddc_ink_setting')
			.setName('Enable drawing')
			.setDesc('If disabled, you will still be able to view previously created drawing embeds.')
			.addToggle((toggle) => {
				toggle.setValue(plugin.settings.drawingEnabled);
				toggle.onChange(async (value) => {
					plugin.settings.drawingEnabled = value;
					await plugin.saveSettings();
					refresh();
				});
			});
}

function insertDrawingSettings(containerEl: HTMLElement) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_controls-section');
	sectionEl.createEl('h2', { text: 'Drawing' });
	sectionEl.createEl('p', { text: `While editing a Markdown file, run the action 'Insert new hand drawn section' to embed a drawing canvas.` });
}

function insertWritingSettings(containerEl: HTMLElement) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_controls-section');
	sectionEl.createEl('h2', { text: 'Writing' });
	sectionEl.createEl('p', { text: `While editing a Markdown file, run the action 'Insert new handwriting section' to embed a section for writing with a stylus.` });
	insertWritingLimitations(sectionEl);
}

function insertWritingLimitations(containerEl: HTMLElement) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_current-limitations-section');
	const accordion = sectionEl.createEl('details');
	accordion.createEl('summary', { text: `Notable writing limitations (Expand for details)` });
	accordion.createEl('p', { text: `Only the last 300 strokes will be visible while writing (Others will dissapear). This is because the plugin currently experiences lag while displaying long amounts of writing thta degrades pen fluidity.` });
	accordion.createEl('p', { text: `All your writing is still saved, however, and will appear in full whenever the embed is locked.` });
}

function insertPrereleaseWarning(containerEl: HTMLElement) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_prerelease-warning-section');
	const accordion = sectionEl.createEl('details', {cls: 'warning'});
	accordion.createEl('summary', { text: `This plugin is in an Alpha state (Expand for details)` });
	accordion.createEl('p', { text: `What does Alpha mean? Development of products like this plugin often involve moving through multiple different stages (e.g. Alpha, Beta, then Standard Release).` });
	accordion.createEl('p', { text: `Alpha, the current stage, means that this plugin is in early development and may undergo large changes that break or change previous functionality.` });
	accordion.createEl('p', { text: `While in Alpha, please exercise caution while using the plugin, however, note that I (The developer of this plugin) am proceeding with caution to help ensure any files created in this version will be compatible or converted to work with future versions (My own vaults depend on it as well).` });
}
