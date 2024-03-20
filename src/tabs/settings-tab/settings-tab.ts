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

		containerEl.createEl('p', {text: 'The Ink plugin enables embedding hand written sections within your markdown files.'});
		
		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: `Notable deficiencies`})

		containerEl.createEl('ul')
			.createEl('li', {text: 'Interfaces are still being styled.'})
			.createEl('li', {text: 'Multiple pen styles are yet to be implemented.'})
			.createEl('li', {text: 'Only the last 300 strokes written will be visible — You will see old strokes disappear as you write. This is because the plugin currently experiences priocessing issues while displaying long amounts of writing. All your writing is still saved, however, by turning off old lines the plugin can ensure that writing continues to feel smooth. This will be fixsed asap and all previous writing will reappear.'})

		containerEl.createEl('p', {text: `For a full roadmap see the `}).createEl('a', {
			href: 'https://github.com/daledesilva/obsidian_ink',
			text: 'github repository.'
		})
		containerEl.createEl('p', {text: `To follow along with upcoming changes, subscribe to the `}).createEl('a', {
			href: 'https://www.youtube.com/playlist?list=PLAiv7XV4xFx2NMRSCxdGiVombKO-TiMAL',
			text: 'dev diaries.'
		})

		// TODO: Collapsible change log
		// containerEl.createEl('p', {
		// 	text: 'Alpha v0.0.359 changes',
		// 	cls: 'ddc_ink_text-warning',
		// });

		containerEl.createEl('hr');
		containerEl.createEl('h1', {text: `Settings`})

		

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