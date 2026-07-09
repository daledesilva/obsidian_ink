import { createSupportButtonSet } from 'src/components/dom-components/support-button-set';
import './settings-tab.scss';
import { App, ButtonComponent, PluginSettingTab, Setting, SliderComponent, TextComponent, ToggleComponent } from "obsidian";
import InkPlugin from "src/main";
import MyPlugin from "src/main";
import { ConfirmationModal } from "src/components/dom-components/modals/confirmation-modal/confirmation-modal";
import { DEFAULT_SETTINGS } from 'src/types/plugin-settings';
import { showWelcomeTips } from 'src/components/dom-components/welcome-notice';
import { showRecentChanges } from 'src/components/dom-components/version-notices';
import { ToggleAccordionSetting } from 'src/components/dom-components/toggle-accordion-setting';
import { TwoWayToggleSetting } from 'src/components/dom-components/two-way-toggle-setting/two-way-toggle-setting';
import { ThreeWayToggleSetting } from 'src/components/dom-components/three-way-toggle-setting/three-way-toggle-setting';
import { setDominantHand } from 'src/stores/dominant-hand-store';
import { vaultHasLegacyInkFiles } from 'src/logic/utils/migration-logic';
import type { StrokeInputEditorKind, StrokeInputTreatAs } from 'src/logic/device-settings/device-settings-types';
import {
	getBooxConnectionEnabled,
	getFingerDrawingEnabled,
	getLastDetectedStrokeInput,
	getStrokeInputTreatAs,
	setBooxConnectionEnabled,
	setFingerDrawingEnabled,
	setStrokeInputTreatAs,
	subscribeDeviceSettingsChanged,
} from 'src/logic/device-settings/device-settings';
import type { DominantHand } from 'src/types/plugin-settings_0_5_0';

/////////
/////////

export function registerSettingsTab(plugin: InkPlugin) {
	plugin.addSettingTab(new MySettingsTab(plugin.app, plugin));
}

export class MySettingsTab extends PluginSettingTab {
	plugin: MyPlugin;
	private unsubscribeDeviceSettings?: () => void;
	private legacyMigrateScanGeneration = 0;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		this.unsubscribeDeviceSettings?.();
		this.unsubscribeDeviceSettings = undefined;

		containerEl.empty();
		
		containerEl.createEl('p').setText('Hand write or draw directly between paragraphs in your notes.');
		
		containerEl.createEl('hr');
		insertGettingStartedSection(containerEl, this.plugin);
		const migrateWrapper = insertMigrateSection(containerEl, this.plugin);
		void this.refreshLegacyMigrateSectionVisibility(migrateWrapper);

		// Declare refs before insertHighLevelSettings so its callbacks can close over them.
		// The callbacks only fire on user interaction, after display() has completed
		// and both refs are assigned below.
		let writingSectionEl!: HTMLElement;
		let drawingSectionEl!: HTMLElement;
		let booxCompanionToggle: ToggleComponent | undefined;
		let fingerDrawingToggle: ToggleComponent | undefined;

		insertHighLevelSettings(containerEl, this.plugin,
			(show) => {
				if (show) writingSectionEl.classList.add('ddc_ink_expanded');
				else writingSectionEl.classList.remove('ddc_ink_expanded');
			},
			(show) => {
				if (show) drawingSectionEl.classList.add('ddc_ink_expanded');
				else drawingSectionEl.classList.remove('ddc_ink_expanded');
			},
			(toggle) => {
				booxCompanionToggle = toggle;
			},
			(toggle) => {
				fingerDrawingToggle = toggle;
			},
		);

		insertTldrawSvgMigrateSection(containerEl, this.plugin);

		containerEl.createEl('hr');
		const strokeInputToggles: ThreeWayToggleSetting<StrokeInputTreatAs>[] = [];
		writingSectionEl = insertWritingSettings(containerEl, this.plugin, strokeInputToggles);
		if (this.plugin.settings.writingEnabled) writingSectionEl.classList.add('ddc_ink_expanded');
		drawingSectionEl = insertDrawingSettings(containerEl, this.plugin, strokeInputToggles);
		if (this.plugin.settings.drawingEnabled) drawingSectionEl.classList.add('ddc_ink_expanded');
		this.unsubscribeDeviceSettings = subscribeDeviceSettingsChanged(() => {
			if (strokeInputToggles[0]) {
				strokeInputToggles[0].setDesc(strokeInputTreatAsSettingDesc('inkWriting'));
			}
			if (strokeInputToggles[1]) {
				strokeInputToggles[1].setDesc(strokeInputTreatAsSettingDesc('inkDrawing'));
			}
			booxCompanionToggle?.setValue(getBooxConnectionEnabled());
			fingerDrawingToggle?.setValue(getFingerDrawingEnabled());
		});
		insertFileOrganisationSection(containerEl, this.plugin);

		new Setting(containerEl)
			.setClass('ddc_ink_bare-setting')
			.addButton( (button) => {
				button.setButtonText('Reset settings…');
				button.onClick(() => {
					new ConfirmationModal({
						plugin: this.plugin,
						title: 'Please confirm',
						message: 'Revert to default settings for Ink plugin?',
						confirmLabel: 'Reset settings',
						confirmAction: () => {
							void this.plugin.resetSettings().then(() => {
								this.display();
							});
						}
					}).open();
				})
			})

		containerEl.createEl('hr');
		insertPrereleaseWarning(containerEl, this.plugin);
		insertPluginDevelopmentSection(containerEl);

		createSupportButtonSet(containerEl);
		

	}

	hide(): void {
		this.legacyMigrateScanGeneration++;
		this.unsubscribeDeviceSettings?.();
		this.unsubscribeDeviceSettings = undefined;
	}

	private async refreshLegacyMigrateSectionVisibility(wrapperEl: HTMLElement) {
		const generation = ++this.legacyMigrateScanGeneration;
		await Promise.resolve();

		if (generation !== this.legacyMigrateScanGeneration) return;

		const hasLegacyFiles = vaultHasLegacyInkFiles(this.plugin.app.vault);
		if (!hasLegacyFiles) return;

		if (generation !== this.legacyMigrateScanGeneration) return;

		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (generation !== this.legacyMigrateScanGeneration) return;
				wrapperEl.classList.add('ddc_ink_expanded');
			});
		});
	}
}

function insertGettingStartedSection(containerEl: HTMLElement, plugin: InkPlugin) {
	const isExpanded = plugin.settings.gettingStartedExpanded ?? true;
	const wrapperEl = containerEl.createDiv('ddc_ink_section-wrapper');
	if (isExpanded) wrapperEl.classList.add('ddc_ink_expanded');

	const sectionEl = wrapperEl.createDiv('ddc_ink_controls-section');

	const headerSetting = new Setting(sectionEl)
		.setClass('ddc_ink_controls-header')
		.setClass('ddc_ink_controls-header--clickable')
		.setName('Getting started')
		.setDesc('Tips for using Ink, compatibility with other processes, and migrating from older versions.');

	const arrowEl = headerSetting.settingEl.createSpan('ddc_ink_collapse-arrow');
	arrowEl.setText('›');
	if (isExpanded) arrowEl.classList.add('ddc_ink_expanded');

	headerSetting.settingEl.addEventListener('click', () => {
		const expanded = wrapperEl.classList.toggle('ddc_ink_expanded');
		arrowEl.classList.toggle('ddc_ink_expanded', expanded);
		plugin.settings.gettingStartedExpanded = expanded;
		void plugin.saveSettings();
	});

	const contentEl = sectionEl.createDiv('ddc_ink_controls-content');

	// Information (tips) first
	const tipsSectionEl = contentEl.createDiv('ddc_ink_tips-section');
	const tipsGridEl = tipsSectionEl.createDiv('ddc_ink_tips-grid');
	tipsGridEl.createDiv('ddc_ink_tips-label').setText('Slash Commands');
	tipsGridEl.createDiv('ddc_ink_tips-desc').setText(`For a more intuitive experience, turn on "Slash commands" in "Obsidian settings" / "core plugins" or install and set up the community plugin "slash commander".`);
	tipsGridEl.createDiv('ddc_ink_tips-label').setText('iPadOS Pencil Scribble');
	tipsGridEl.createDiv('ddc_ink_tips-desc').setText(`If using an iPad, the Apple pencil "Scribble" setting can interfere with input in Ink sections. Disable it in iPadOS settings for a better experience.`);
	tipsGridEl.createDiv('ddc_ink_tips-label').setText('Obsidian Sync');
	tipsGridEl.createDiv('ddc_ink_tips-desc').setText(`If using "Obsidian Sync", turn on "sync all other types" in the Obsidian Sync settings.`);

	// Rewatch button
	new Setting(contentEl)
		.setClass('ddc_ink_bare-setting')
		.setClass('ddc_ink_bare-setting--no-bottom-margin')
		.addButton((btn) => {
			btn.setButtonText('View recent changes');
			btn.onClick(() => showRecentChanges(plugin));
		})
		.addButton((btn) => {
			btn.setButtonText('Rewatch welcome tips');
			btn.setCta();
			btn.onClick(() => showWelcomeTips(plugin));
		});
}

function insertMigrateSection(containerEl: HTMLElement, plugin: InkPlugin): HTMLElement {
	const wrapperEl = containerEl.createDiv('ddc_ink_legacy-migrate-card-wrapper');
	const innerEl = wrapperEl.createDiv('ddc_ink_legacy-migrate-card-inner');
	const cardEl = innerEl.createDiv('ddc_ink_legacy-migrate-card');

	cardEl.createDiv({
		cls: 'ddc_ink_legacy-migrate-card-title',
		text: 'Migrate Legacy Ink Files',
	});

	cardEl.createDiv({
		cls: 'ddc_ink_legacy-migrate-card-desc',
		text: 'This version of Ink uses a new SVG format. To use the newer features, you\'ll need to migrate your legacy Ink files.',
	});

	new Setting(cardEl)
		.setClass('ddc_ink_bare-setting')
		.setClass('ddc_ink_bare-setting--left')
		.setClass('ddc_ink_legacy-migrate-card-action')
		.addButton((button) => {
			button.setCta();
			button.setButtonText('Show migration options…');
			button.onClick(() => plugin.openMigrationModal());
		});

	return wrapperEl;
}

function insertTldrawSvgMigrateSection(containerEl: HTMLElement, plugin: InkPlugin) {
	new Setting(containerEl)
		.setClass('ddc_ink_setting')
		.setName('Developer: Migrate tldraw SVG to ink-canvas')
		.setDesc(
			'Bulk-convert v2 SVG files still on <tldraw> metadata (referenced by embeds) to ink-canvas in place. Drawing embed viewBox is refit to stroke bounds.',
		)
		.addButton((button) => {
			button.setButtonText('Migrate tldraw SVGs…');
			button.onClick(() => plugin.openTldrawSvgMigrationModal());
		});
}

function insertPluginDevelopmentSection(containerEl: HTMLElement) {
	const wrapperEl = containerEl.createDiv('ddc_ink_section');

	const sectionEl = wrapperEl.createDiv('ddc_ink_controls-section');

	new Setting(sectionEl)
		.setClass('ddc_ink_controls-header')
		.setName('Plugin development')
		.setDesc('For information on this plugin\'s development, visit the links below.');

	const contentEl = sectionEl.createDiv('ddc_ink_controls-content');

	const tipsGridEl = contentEl.createDiv('ddc_ink_tips-grid');
	const addLinkRow = (parent: HTMLElement, href: string, label: string, description: string) => {
		const labelEl = parent.createDiv('ddc_ink_tips-label');
		const a = labelEl.createEl('a', { href, text: label });
		a.setAttribute('target', '_blank');
		a.setAttribute('rel', 'noopener');
		parent.createDiv('ddc_ink_tips-desc').setText(description);
	};
	addLinkRow(tipsGridEl, 'https://github.com/daledesilva/obsidian_ink/releases', 'Latest Changes', 'Version history, release notes, and download links for each Ink release.');
	addLinkRow(tipsGridEl, 'https://github.com/daledesilva/obsidian_ink', 'Roadmap', 'Main repository with source code, roadmap, and project information.');
	addLinkRow(tipsGridEl, 'https://www.youtube.com/playlist?list=PLAiv7XV4xFx2NMRSCxdGiVombKO-TiMAL', 'Development Diaries', 'Video diaries documenting the plugin\'s development progress.');
	addLinkRow(tipsGridEl, 'https://github.com/daledesilva/obsidian_ink/issues', 'Request feature / Report bug', 'Submit feature requests, report bugs, or join the discussion.');
}

function insertHighLevelSettings(
	containerEl: HTMLElement,
	plugin: InkPlugin,
	onToggleWriting: (show: boolean) => void,
	onToggleDrawing: (show: boolean) => void,
	onBooxToggleReady?: (toggle: ToggleComponent) => void,
	onFingerDrawingToggleReady?: (toggle: ToggleComponent) => void,
) {

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
				onToggleWriting(value);
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
				onToggleDrawing(value);
			});
		});

	new Setting(containerEl)
		.setClass('ddc_ink_setting')
		.setName('Enable Boox companion app')
		.setDesc('This enables connection to the Boox companion app for passing through smoother pen strokes. This is currently only available for a closed group of testers.')
		.addToggle((toggle) => {
			toggle.setValue(getBooxConnectionEnabled());
			onBooxToggleReady?.(toggle);
			toggle.onChange((value: boolean) => {
				setBooxConnectionEnabled(value);
				plugin.booxConnection.onSettingsChanged();
			});
		});

	new Setting(containerEl)
		.setClass('ddc_ink_setting')
		.setName('Enable finger drawing')
		.setDesc('Shows a toolbar toggle while editing so you can draw with your finger on touch devices. When off, fingers scroll the note as usual.')
		.addToggle((toggle) => {
			toggle.setValue(getFingerDrawingEnabled());
			onFingerDrawingToggleReady?.(toggle);
			toggle.onChange((value: boolean) => {
				setFingerDrawingEnabled(value);
			});
		});

	new TwoWayToggleSetting<DominantHand>(containerEl)
		.setName('Dominant hand')
		.setDesc('Which side undo/redo and extend controls appear on while editing.')
		.setOptionPair('right', 'Right', 'left', 'Left')
		.setValue(plugin.settings.dominantHand)
		.onChange(async (value) => {
			plugin.settings.dominantHand = value;
			setDominantHand(value);
			await plugin.saveSettings();
		});

}

function insertFileOrganisationSection(containerEl: HTMLElement, plugin: InkPlugin) {

	const saveWritingFolder = async (enteredValue: string) => {
		const value = enteredValue || DEFAULT_SETTINGS.writingSubfolder;
		plugin.settings.writingSubfolder = value.trim();
		await plugin.saveSettings();
	}

	const saveDrawingFolder = async (enteredValue: string) => {
		const value = enteredValue || DEFAULT_SETTINGS.drawingSubfolder;
		plugin.settings.drawingSubfolder = value.trim();
		await plugin.saveSettings();
	}

	const accordionSection = new ToggleAccordionSetting(containerEl)
		.setName('Customise file organisation')
		.setExpanded(plugin.settings.customAttachmentFolders)
		.onToggle( async (value: boolean) => {
			plugin.settings.customAttachmentFolders = value;
			await plugin.saveSettings();
		})
		.setContent((container) => {
			// TODO: This should be abstracted as a dom component
			let obsidianBtn: ButtonComponent, rootBtn: ButtonComponent, noteBtn: ButtonComponent;

			const setActiveLocationButton = (active: 'obsidian' | 'root' | 'note') => {
				obsidianBtn.removeCta(); obsidianBtn.setDisabled(false);
				rootBtn.removeCta();    rootBtn.setDisabled(false);
				noteBtn.removeCta();    noteBtn.setDisabled(false);
				const activeBtn = active === 'obsidian' ? obsidianBtn : active === 'root' ? rootBtn : noteBtn;
				activeBtn.setCta(); activeBtn.setDisabled(true);
			};

			new Setting(container)
				.setClass('ddc_ink_button-set')
				.setName(`Where should Ink files be saved when created in a note?`)
				// .setDesc(`The writing and drawing files will be saved into same location as other Obsidian attachments rather than the vault's root folder. The files will still be organised into the subfolders you specify below. You can change the default Obsidian attachment path in in the Files and links tab.`)
				.addButton( (button) => {
					obsidianBtn = button;
					button.setButtonText('Obsidian attachment folder')
					button.setClass('ddc_ink_left-most')
					if(plugin.settings.noteAttachmentFolderLocation === 'obsidian') {
						button.setCta()
						button.setDisabled(true)
					}
					button.onClick( async (e) => {
						plugin.settings.noteAttachmentFolderLocation = 'obsidian';
						await plugin.saveSettings();
						setActiveLocationButton('obsidian');
					})
				})
				.addButton( (button) => {
					rootBtn = button;
					button.setButtonText('Vault root')
					button.setClass('ddc_ink_middle')
					if(plugin.settings.noteAttachmentFolderLocation === 'root') {
						button.setCta()
						button.setDisabled(true)
					}
					button.onClick( async (e) => {
						plugin.settings.noteAttachmentFolderLocation = 'root';
						await plugin.saveSettings();
						setActiveLocationButton('root');
					})
				})
				.addButton( (button) => {
					noteBtn = button;
					button.setButtonText('Next to the note')
					button.setClass('ddc_ink_right-most')
					if(plugin.settings.noteAttachmentFolderLocation === 'note') {
						button.setCta()
						button.setDisabled(true)
					}
					button.onClick( async (e) => {
						plugin.settings.noteAttachmentFolderLocation = 'note';
						await plugin.saveSettings();
						setActiveLocationButton('note');
					})
				})
			// TODO: This should be abstracted as a dom component
			// new Setting(container)
			// 	.setClass('ddc_ink_button-set')
			// 	.setName(`Where should Ink files be saved when created independantly?`)
			// 	// .setDesc(`The writing and drawing files will be saved into same location as other Obsidian attachments rather than the vault's root folder. The files will still be organised into the subfolders you specify below. You can change the default Obsidian attachment path in in the Files and links tab.`)
			// 	.addButton( (button) => {
			// 		button.setButtonText('Obsidian attachment folder')
			// 		button.setClass('ddc_ink_left-most')
			// 		if(plugin.settings.notelessAttachmentFolderLocation === 'obsidian') {
			// 			button.setCta()
			// 			button.setDisabled(true)
			// 		}
			// 		button.onClick( async (e) => {
			// 			plugin.settings.notelessAttachmentFolderLocation = 'obsidian';
			// 			await plugin.saveSettings();
			// 			refresh();
			// 		})
			// 	})
			// 	.addButton( (button) => {
			// 		button.setButtonText('Vault root')
			// 		button.setClass('ddc_ink_middle')
			// 		if(plugin.settings.notelessAttachmentFolderLocation === 'root') {
			// 			button.setCta()
			// 			button.setDisabled(true)
			// 		}
			// 		button.onClick( async (e) => {
			// 			plugin.settings.notelessAttachmentFolderLocation = 'root';
			// 			await plugin.saveSettings();
			// 			refresh();
			// 		})
			// 	})

			let inputSettingEl = new Setting(container)
				.setClass('ddc_ink_setting')
				.setName('Writing files subfolder')
				.addText((textItem) => {
					textItem.setValue(plugin.settings.writingSubfolder.toString());
					textItem.setPlaceholder(DEFAULT_SETTINGS.writingSubfolder.toString());
					textItem.inputEl.addEventListener('blur', (_ev: FocusEvent) => {
						void saveWritingFolder(textItem.getValue());
					})
					textItem.inputEl.addEventListener('keypress', (ev: KeyboardEvent) => {
						if(ev.key === 'Enter') void saveWritingFolder(textItem.getValue());
					})
				});
			inputSettingEl.settingEl.classList.add('ddc_ink_input-medium');

			inputSettingEl = new Setting(container)
				.setClass('ddc_ink_setting')
				.setName('Drawing files subfolder')
				.addText((textItem) => {
					textItem.setValue(plugin.settings.drawingSubfolder.toString());
					textItem.setPlaceholder(DEFAULT_SETTINGS.drawingSubfolder.toString());
					textItem.inputEl.addEventListener('blur', (_ev: FocusEvent) => {
						void saveDrawingFolder(textItem.getValue());
					})
					textItem.inputEl.addEventListener('keypress', (ev: KeyboardEvent) => {
						if(ev.key === 'Enter') void saveDrawingFolder(textItem.getValue());
					})
				});
			inputSettingEl.settingEl.classList.add('ddc_ink_input-medium');
		})


}

function strokeInputTreatAsSettingDesc(editorKind: StrokeInputEditorKind): DocumentFragment {
	const last = getLastDetectedStrokeInput();
	const detectedLabel = last === 'pen' ? 'Pen' : last === 'mouse' ? 'Mouse' : 'None';

	const frag = document.createDocumentFragment();

	const intro = document.createElement('p');
	intro.textContent =
		'Automatically detect pen or mouse from pressure (auto), use pen pressure and faithful smoothing (pen), or simulated pressure with higher smoothing (mouse).';
	frag.appendChild(intro);

	const detectedParagraph = document.createElement('p');
	detectedParagraph.classList.add('ddc_ink_stroke-input-detected-paragraph');

	const detectedLine = document.createElement('strong');
	detectedLine.append('Last detected input: ');
	const detectedValue = document.createElement('span');
	detectedValue.className = 'ddc_ink_stroke-input-detected-value';
	detectedValue.textContent = detectedLabel;
	detectedLine.appendChild(detectedValue);
	detectedParagraph.appendChild(detectedLine);

	detectedParagraph.appendChild(document.createElement('br'));
	detectedParagraph.append('If detection is incorrect, choose Pen or Mouse manually.');

	frag.appendChild(detectedParagraph);
	return frag;
}

function insertStrokeInputTreatAsSetting(
	contentEl: HTMLElement,
	editorKind: StrokeInputEditorKind,
): ThreeWayToggleSetting<StrokeInputTreatAs> {
	return new ThreeWayToggleSetting<StrokeInputTreatAs>(contentEl)
		.setName('Smoothing and pressure')
		.setDesc(strokeInputTreatAsSettingDesc(editorKind))
		.setOptions([
			{ value: 'auto', label: 'Auto' },
			{ value: 'pen', label: 'Pen' },
			{ value: 'mouse', label: 'Mouse' },
		])
		.setValue(getStrokeInputTreatAs(editorKind))
		.onChange((value) => {
			setStrokeInputTreatAs(editorKind, value);
		});
}

function insertDrawingSettings(
	containerEl: HTMLElement,
	plugin: InkPlugin,
	strokeInputToggles: ThreeWayToggleSetting<StrokeInputTreatAs>[],
): HTMLElement {
	const wrapperEl = containerEl.createDiv('ddc_ink_section-wrapper');
	const sectionEl = wrapperEl.createDiv('ddc_ink_controls-section');

	new Setting(sectionEl)
		.setClass('ddc_ink_controls-header')
		.setName('Drawing')
		.setDesc(`While editing a Markdown file, run the action 'insert new hand drawn section' to embed a drawing canvas.`);

	const contentEl = sectionEl.createDiv('ddc_ink_controls-content');

	strokeInputToggles.push(insertStrokeInputTreatAsSetting(contentEl, 'inkDrawing'));

	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setName('Show grid in new drawings')
		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.drawingGridEnabledByDefault);
			toggle.onChange(async (value: boolean) => {
				plugin.settings.drawingGridEnabledByDefault = value;
				await plugin.saveSettings();
			});
		});

	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setName('Show frame around drawing when not editing')

		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.drawingFrameWhenLocked);
			toggle.onChange( async (value: boolean) => {
				plugin.settings.drawingFrameWhenLocked = value;
				await plugin.saveSettings();
			})
		});

	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setName('Show background when not editing')

		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.drawingBackgroundWhenLocked);
			toggle.onChange( async (value: boolean) => {
				plugin.settings.drawingBackgroundWhenLocked = value;
				await plugin.saveSettings();
			})
		});

	return wrapperEl;
}

function insertWritingSettings(
	containerEl: HTMLElement,
	plugin: InkPlugin,
	strokeInputToggles: ThreeWayToggleSetting<StrokeInputTreatAs>[],
): HTMLElement {

	const saveWritingBufferLines = async (enteredValue: string) => {
		const parsed = parseInt(enteredValue);
		const value = (!isNaN(parsed) && parsed >= 0) ? parsed : DEFAULT_SETTINGS.writingBufferLines;
		plugin.settings.writingBufferLines = value;
		await plugin.saveSettings();
	}

	let lineHeightSliderComponent: SliderComponent;
	let lineHeightTextComponent: TextComponent;

	const applyWritingLineHeight = async (value: number) => {
		const clampedValue = Math.max(50, Math.min(400, value));
		plugin.settings.writingLineHeight = clampedValue;
		await plugin.saveSettings();
		lineHeightSliderComponent.setValue(clampedValue);
		lineHeightTextComponent.setValue(clampedValue.toString());
	}

	const wrapperEl = containerEl.createDiv('ddc_ink_section-wrapper');
	const sectionEl = wrapperEl.createDiv('ddc_ink_controls-section');

	new Setting(sectionEl)
		.setClass('ddc_ink_controls-header')
		.setName('Writing')
		.setDesc(`While editing a Markdown file, run the action 'Insert new handwriting section' to embed a section for writing with a pen.`);

	const contentEl = sectionEl.createDiv('ddc_ink_controls-content');

	strokeInputToggles.push(insertStrokeInputTreatAsSetting(contentEl, 'inkWriting'));

	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setName('Show ruled lines when not editing')

		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.writingLinesWhenLocked);
			toggle.onChange( async (value: boolean) => {
				plugin.settings.writingLinesWhenLocked = value;
				await plugin.saveSettings();
			})
		});

	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setName('Show background when not editing')

		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.writingBackgroundWhenLocked);
			toggle.onChange( async (value: boolean) => {
				plugin.settings.writingBackgroundWhenLocked = value;
				await plugin.saveSettings();
			})
		});
	
	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setName('Line height')
		.setDesc(`Height in pixels of each ruled line. Only affects new writing embeds.`)

		.addSlider((slider) => {
			lineHeightSliderComponent = slider;
			const currentValue = plugin.settings.writingLineHeight ?? DEFAULT_SETTINGS.writingLineHeight;
			slider
				.setLimits(50, 400, 10)
				.setValue(currentValue);
			// 'input' fires continuously while dragging — update the text field in real time
			slider.sliderEl.addEventListener('input', () => {
				lineHeightTextComponent.setValue(slider.getValue().toString());
			});
			// 'onChange' uses the native 'change' event — fires on release, persists the value
			slider.onChange(async (value: number) => {
				await applyWritingLineHeight(value);
			});
		})
		.addText((textItem) => {
			lineHeightTextComponent = textItem;
			const currentValue = plugin.settings.writingLineHeight ?? DEFAULT_SETTINGS.writingLineHeight;
			textItem.setValue(currentValue.toString());
			textItem.inputEl.classList.add('ddc_ink_line-height-input');
			textItem.inputEl.addEventListener('blur', () => {
				const parsed = parseInt(textItem.getValue());
				const valueToApply = !isNaN(parsed) ? parsed : DEFAULT_SETTINGS.writingLineHeight;
				void applyWritingLineHeight(valueToApply);
			});
			textItem.inputEl.addEventListener('keypress', (ev: KeyboardEvent) => {
				if (ev.key === 'Enter') {
					const parsed = parseInt(textItem.getValue());
					const valueToApply = !isNaN(parsed) ? parsed : DEFAULT_SETTINGS.writingLineHeight;
					void applyWritingLineHeight(valueToApply);
				}
			});
		});

	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setName('Buffer lines when editing')
		.setDesc(`Number of empty lines shown below your writing while editing. Writing reaches the last line before the embed extends in height.`)

		.addText((textItem) => {
			textItem.setValue(plugin.settings.writingBufferLines.toString());
			textItem.setPlaceholder(DEFAULT_SETTINGS.writingBufferLines.toString());
			textItem.inputEl.addEventListener('blur', () => {
				void saveWritingBufferLines(textItem.getValue());
			});
			textItem.inputEl.addEventListener('keypress', (ev: KeyboardEvent) => {
				if (ev.key === 'Enter') void saveWritingBufferLines(textItem.getValue());
			});
		});

	insertWritingLimitations(contentEl);
	return wrapperEl;
}

function insertWritingLimitations(containerEl: HTMLElement) {
	// const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_current-limitations-section');
	// const accordion = sectionEl.createEl('details');
	// accordion.createEl('summary', { text: `Notable writing limitations (Expand for details)` });
	// accordion.createEl('p', { text: `Only the last 300 strokes will be visible while writing (Others will dissapear). This is because the plugin currently experiences lag while displaying long amounts of writing that degrades pen fluidity.` });
	// accordion.createEl('p', { text: `All your writing is still saved, however, and will appear in full whenever the embed is locked.` });
}

function insertPrereleaseWarning(containerEl: HTMLElement, plugin: InkPlugin) {
	const wrapperEl = containerEl.createDiv('ddc_ink_section-wrapper');
	const controlsEl = wrapperEl.createDiv('ddc_ink_controls-section');

	const headerSetting = new Setting(controlsEl)
		.setClass('ddc_ink_controls-header')
		.setClass('ddc_ink_controls-header--clickable')
		.setName('This plugin is in beta')
		.setDesc('Always back up your files. Expand for details.');

	const arrowEl = headerSetting.settingEl.createSpan('ddc_ink_collapse-arrow');
	arrowEl.setText('›');

	headerSetting.settingEl.addEventListener('click', () => {
		const expanded = wrapperEl.classList.toggle('ddc_ink_expanded');
		arrowEl.classList.toggle('ddc_ink_expanded', expanded);
	});

	const contentEl = controlsEl.createDiv('ddc_ink_controls-content');
	contentEl.createEl('p', { text: `Beta means the plugin is still evolving. Changes to embed formats and file-handling features, even when thoroughly tested, may occasionally introduce issues that affect your vault. Always keep backups of your data.` });

	new Setting(contentEl)
		.setClass('ddc_ink_setting')
		.setName('Enable debug logging')
		.setDesc('When enabled, debug information is written to an ink-debug.md file in your vault root. This includes writing and drawing activity, so do not enable this unless you are actively troubleshooting a bug to provide logs for a bug report. Disable it again once you\'re done.')
		.addToggle((toggle) => {
			toggle.setValue(plugin.settings.debugLoggingEnabled);
			toggle.onChange(async (value: boolean) => {
				plugin.settings.debugLoggingEnabled = value;
				await plugin.saveSettings();
			});
		});
}

function insertGenericWarning(containerEl: HTMLElement, text: string) {
	const sectionEl = containerEl.createDiv('ddc_ink_section ddc_ink_generic-warning-section');
	const warningEl = sectionEl.createDiv('warning');
	warningEl.createEl('p', {text});
}
