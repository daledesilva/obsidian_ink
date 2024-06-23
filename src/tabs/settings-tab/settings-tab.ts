import { createSupportButtonSet } from 'src/components/dom-components/support-button-set';
import './settings-tab.scss';
import { App, PluginSettingTab, Setting } from "obsidian";
import InkPlugin from "src/main";
import MyPlugin from "src/main";
import { ConfirmationModal } from "src/modals/confirmation-modal/confirmation-modal";
import { DEFAULT_SETTINGS } from 'src/types/plugin-settings';
import { showWelcomeTips, showWelcomeTips_maybe } from 'src/notices/welcome-notice';
import { ToggleAccordionSetting } from 'src/components/dom-components/toggle-accordion-setting';

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

		insertPrereleaseWarning(containerEl);

		containerEl.createEl('hr');
		insertMoreInfoLinks(containerEl);
			
		// TODO: Collapsible change log
		// containerEl.createEl('p', {
		// 	text: 'Alpha v0.0.359 changes',
		// 	cls: 'ddc_ink_text-warning',
		// });		
		
		insertSetupGuide(this.plugin, containerEl);

		insertHighLevelSettings(containerEl, this.plugin, () => this.display());
		insertSubfolderSettings(containerEl, this.plugin, () => this.display());

		containerEl.createEl('hr');
		if(this.plugin.settings.writingEnabled)	insertWritingSettings(containerEl, this.plugin, () => this.display());
		if(this.plugin.settings.drawingEnabled)	insertDrawingSettings(containerEl, this.plugin, () => this.display());
	
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

		createSupportButtonSet(containerEl);
		

	}
}

function insertSetupGuide(plugin: InkPlugin, containerEl: HTMLElement) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_setup-guide-section');
	const accordion = sectionEl.createEl('details');
	accordion.createEl('summary', { text: `Setup tips and tutorial (Expand for details)` });
	accordion.createEl('p', { text: `To make this plugin more intuitive, consider turning on 'Slash commands' in 'Obsidian Settings' / 'Core Plugins' or install and set up the community plugin 'Slash Commander'.` });
	new Setting(accordion)
		.addButton( btn => {
			btn.setButtonText('Rewatch welcome tips');
			btn.onClick( () => showWelcomeTips(plugin) );
			btn.setCta();
		})
}

function insertMoreInfoLinks(containerEl: HTMLElement) {
	const sectionEl = containerEl.createDiv('ddc_ink_section');
	sectionEl.createEl('p', { text: `For information on this plugin's development, visit the links below. Feel free to leave comments in the development diaries on YouTube.` });
	const list = sectionEl.createEl('ul');
	list.createEl('li').createEl('a', {
		href: 'https://github.com/daledesilva/obsidian_ink/releases',
		text: 'Latest Changes'
	});
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

	new Setting(containerEl)
		.setClass('ddc_ink_setting')
		.setName('Enable writing')
		// .setDesc('If disabled, you will still be able to view previously created writing embeds.')
		.setDesc('If disabled, you will not be able to add new writing embeds and those already embedded will appear as raw code. Existing writing files will be hidden in Obsidian but still exist on disk. Changing this setting will require a restart of Obsidian to take effect.')
		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.writingEnabled);
			toggle.onChange(async (value) => {
				plugin.settings.writingEnabled = value;
				await plugin.saveSettings();
				refresh();
			});
		});

	new Setting(containerEl)
		.setClass('ddc_ink_setting')
		.setName('Enable drawing')
		// .setDesc('If disabled, you will still be able to view previously created drawing embeds.')
		.setDesc('If disabled, you will not be able to add new drawing embeds and those already embedded will appear as raw code. Existing drawing files will be hidden in Obsidian but still exist on disk. Changing this setting will require a restart of Obsidian to take effect.')
		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.drawingEnabled);
			toggle.onChange(async (value) => {
				plugin.settings.drawingEnabled = value;
				await plugin.saveSettings();
				refresh();
			});
		});

}

function insertSubfolderSettings(containerEl: HTMLElement, plugin: InkPlugin, refresh: Function) {

	const saveWritingFolder = async (enteredValue: string) => {
		const value = enteredValue || DEFAULT_SETTINGS.writingSubfolder;
		plugin.settings.writingSubfolder = value.trim();
		await plugin.saveSettings();
		refresh();
	}

	const saveDrawingFolder = async (enteredValue: string) => {
		const value = enteredValue || DEFAULT_SETTINGS.drawingSubfolder;
		plugin.settings.drawingSubfolder = value.trim();
		await plugin.saveSettings();
		refresh();
	}

	const accordionSection = new ToggleAccordionSetting(containerEl)
		.setName('Customise file organisation')
		.setExpanded(plugin.settings.customAttachmentFolders)
		.onToggle( async (value: boolean) => {
			plugin.settings.customAttachmentFolders = value;
			await plugin.saveSettings();
			refresh();
		})
		.setContent((container) => {
			new Setting(container)
				.setClass('ddc_ink_setting')
				.setName(`Use Obsidian's default location for attachments`)
				.setDesc(`The writing and drawing files will be saved into same location as other Obsidian attachments rather than the vault's root folder. The files will still be organised into the subfolders you specify below. You can change the default Obsidian attachment path in in the Files and links tab.`)
				.addToggle((toggle) => {
					toggle.setValue(plugin.settings.useObsidianAttachmentFolder);
					toggle.onChange(async (value) => {
						plugin.settings.useObsidianAttachmentFolder = value;
						await plugin.saveSettings();
						refresh();
					});
				});

			let inputSettingEl = new Setting(container)
				.setClass('ddc_ink_setting')
				.setName('Writing files subfolder')
				.addText((textItem) => {
					textItem.setValue(plugin.settings.writingSubfolder.toString());
					textItem.setPlaceholder(DEFAULT_SETTINGS.writingSubfolder.toString());
					textItem.inputEl.addEventListener('blur', async (ev: FocusEvent) => {
						saveWritingFolder(textItem.getValue());
					})
					textItem.inputEl.addEventListener('keypress', async (ev: KeyboardEvent) => {
						if(ev.key === 'Enter') saveWritingFolder(textItem.getValue());
					})
				});
			inputSettingEl.settingEl.classList.add('ddc_ink_input-medium');

			inputSettingEl = new Setting(container)
				.setClass('ddc_ink_setting')
				.setName('Drawing files subfolder')
				.addText((textItem) => {
					textItem.setValue(plugin.settings.drawingSubfolder.toString());
					textItem.setPlaceholder(DEFAULT_SETTINGS.drawingSubfolder.toString());
					textItem.inputEl.addEventListener('blur', async (ev: FocusEvent) => {
						saveDrawingFolder(textItem.getValue());
					})
					textItem.inputEl.addEventListener('keypress', async (ev: KeyboardEvent) => {
						if(ev.key === 'Enter') saveDrawingFolder(textItem.getValue());
					})
				});
			inputSettingEl.settingEl.classList.add('ddc_ink_input-medium');
		})


}

function insertDrawingSettings(containerEl: HTMLElement, plugin: InkPlugin, refresh: Function) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_controls-section');
	sectionEl.createEl('h2', { text: 'Drawing' });
	sectionEl.createEl('p', { text: `While editing a Markdown file, run the action 'Insert new hand drawn section' to embed a drawing canvas.` });

	new Setting(sectionEl)
		.setClass('ddc_ink_setting')
		.setName('Show frame around drawing when not editing')

		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.drawingFrameWhenLocked);
			toggle.onChange( async (value: boolean) => {
				plugin.settings.drawingFrameWhenLocked = value;
				await plugin.saveSettings();
				refresh();
			})
		});

	new Setting(sectionEl)
		.setClass('ddc_ink_setting')
		.setName('Show background when not editing')

		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.drawingBackgroundWhenLocked);
			toggle.onChange( async (value: boolean) => {
				plugin.settings.drawingBackgroundWhenLocked = value;
				await plugin.saveSettings();
				refresh();
			})
		});

}

function insertWritingSettings(containerEl: HTMLElement, plugin: InkPlugin, refresh: Function) {

	const saveWritingStrokeLimit = async (enteredValue: string) => {
		const value = parseInt(enteredValue) || DEFAULT_SETTINGS.writingStrokeLimit;
		plugin.settings.writingStrokeLimit = value;
		await plugin.saveSettings();
		refresh();
	}

	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_controls-section');
	sectionEl.createEl('h2', { text: 'Writing' });
	sectionEl.createEl('p', { text: `While editing a Markdown file, run the action 'Insert new handwriting section' to embed a section for writing with a stylus.` });
	
	new Setting(sectionEl)
		.setClass('ddc_ink_setting')
		.setName('Show ruled lines when not editing')

		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.writingLinesWhenLocked);
			toggle.onChange( async (value: boolean) => {
				plugin.settings.writingLinesWhenLocked = value;
				await plugin.saveSettings();
				refresh();
			})
		});

	new Setting(sectionEl)
		.setClass('ddc_ink_setting')
		.setName('Show background when not editing')

		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.writingBackgroundWhenLocked);
			toggle.onChange( async (value: boolean) => {
				plugin.settings.writingBackgroundWhenLocked = value;
				await plugin.saveSettings();
				refresh();
			})
		});
	
	new Setting(sectionEl)
		.setClass('ddc_ink_setting')
		.setName('Writing stroke limit')
		.setDesc(`Too much writing in one embed can create a lag between your physical pen movement and the line appearing on screen. The stroke limit defines the maximum pen strokes before old strokes start becoming invisible until the embed is locked. Set this to a lower number if you're experiencing lag or jagged writing.`)

		.addText((textItem) => {
			textItem.setValue(plugin.settings.writingStrokeLimit.toString());
			textItem.setPlaceholder(DEFAULT_SETTINGS.writingStrokeLimit.toString());
			// TODO: Combine the blur and the enter into one abstracted and reusable function
			textItem.inputEl.addEventListener('blur', async (ev: FocusEvent) => {
				saveWritingStrokeLimit(textItem.getValue())
			})
			textItem.inputEl.addEventListener('keypress', async (ev: KeyboardEvent) => {
				if(ev.key === 'Enter') saveWritingStrokeLimit(textItem.getValue())
			})
		});
	insertWritingLimitations(sectionEl);
}

function insertWritingLimitations(containerEl: HTMLElement) {
	// const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_current-limitations-section');
	// const accordion = sectionEl.createEl('details');
	// accordion.createEl('summary', { text: `Notable writing limitations (Expand for details)` });
	// accordion.createEl('p', { text: `Only the last 300 strokes will be visible while writing (Others will dissapear). This is because the plugin currently experiences lag while displaying long amounts of writing that degrades pen fluidity.` });
	// accordion.createEl('p', { text: `All your writing is still saved, however, and will appear in full whenever the embed is locked.` });
}

function insertPrereleaseWarning(containerEl: HTMLElement) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_prerelease-warning-section');
	const accordion = sectionEl.createEl('details', {cls: 'warning'});
	accordion.createEl('summary', { text: `This plugin is in an Alpha state (Expand for details)` });
	accordion.createEl('p', { text: `What does Alpha mean? Development of products like this plugin often involve moving through multiple different stages (e.g. Alpha, Beta, then Standard Release).` });
	accordion.createEl('p', { text: `Alpha, the current stage, means that this plugin is in early development and may undergo large changes that break or change previous functionality.` });
	accordion.createEl('p', { text: `While in Alpha, please exercise caution while using the plugin, however, note that I (The developer of this plugin) am proceeding with caution to help ensure any files created in this version will be compatible or converted to work with future versions (My own vaults depend on it as well).` });
}

function insertGenericWarning(containerEl: HTMLElement, text: string) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_generic-warning-section');
	const warningEl = sectionEl.createDiv('warning');
	warningEl.createEl('p', {text});
}
