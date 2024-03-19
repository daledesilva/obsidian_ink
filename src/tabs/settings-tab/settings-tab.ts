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

		containerEl.createEl('p', {text: 'The Ink plugin enables embedding hand written sections within your markdown files.'});
		containerEl.createEl('p').createEl('strong').createEl('em', {text: 'This plugin is in an Alpha state.'});

		containerEl.createEl('hr');
		containerEl.createEl('h2', {text: 'Setup'});
		containerEl.createEl('p', {text: `To make this plugin more intuitive, consider using a plugin like Slash Commander to make the insert commands more easily accessible.`});
		
		containerEl.createEl('hr');
		containerEl.createEl('h2', {text: 'High level functionality'});

		new Setting(containerEl)
			.setClass('ddc_ink_setting')
			.setName('Writing enabled')
			.setDesc('You will still be able to view previously created writing embeds.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.writingEnabled);
				toggle.onChange(async (value) => {
					this.plugin.settings.writingEnabled = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setClass('ddc_ink_setting')
			.setName('Drawing enabled')
			.setDesc('You will still be able to view previously created drawing embeds.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.drawingEnabled);
				toggle.onChange(async (value) => {
					this.plugin.settings.drawingEnabled = value;
					await this.plugin.saveSettings();
				});
			});

		containerEl.createEl('hr');
		containerEl.createEl('h2', {text: 'General'});

		new Setting(containerEl)
			.setClass('ddc_ink_setting')
			.setName('Use default attachment folder')
			.setDesc(`This will create the 'Ink' folder inside your default attachment folder defined in the 'Files and links' settings tab. Otherwise it will be at the root of your vault.`)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.useDefaultAttachmentFolder);
				toggle.onChange(async (value) => {
					this.plugin.settings.useDefaultAttachmentFolder = value;
					await this.plugin.saveSettings();
				});
			});


		containerEl.createEl('hr');
		containerEl.createEl('h2', {text: 'Writing'});
		containerEl.createEl('p', {text: `While editing a Markdown file, run the action 'Insert new handwriting section' to embed a section for writing with a stylus.`});
		
		containerEl.createEl('hr');
		containerEl.createEl('h2', {text: 'Drawing'});
		containerEl.createEl('p', {text: `While editing a Markdown file, run the action 'Insert new hand drawn section' to embed a drawing canvas.`});
	
			
		// new Setting(containerEl)
		// 	.setClass('uo_setting')
		// 	.setName('Note import folder')
		// 	.addText((text) => {
		// 		text.setValue(this.plugin.settings.folderNames.notes);
		// 		text.onChange(async (value) => {
		// 			this.plugin.settings.folderNames.notes = value;
		// 			await this.plugin.saveSettings();
		// 		});
		// 	});



		containerEl.createEl('hr');


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