import { Modal, Setting } from "obsidian";
import MyPlugin from "src/main";

////////
////////

export class InsertCopiedFileModal extends Modal {
	filetype: string; // i.e. 'drawing' or 'writing'
	instanceAction: Function;
	duplicateAction: Function;
	cancelAction: Function;

	constructor(options: {
		plugin: MyPlugin,
		filetype: string,
		instanceAction: Function;
		duplicateAction: Function;
		cancelAction: Function;
	}) {
		super(options.plugin.app);
		this.filetype = options.filetype;
		this.instanceAction = options.instanceAction;
		this.duplicateAction = options.duplicateAction;
		this.cancelAction = options.cancelAction;
	}

	onOpen() {
		const {titleEl, contentEl} = this;

		titleEl.setText(`Insert copied ${this.filetype} file`);
		// contentEl.createEl('p', {text: `Embed reference to existing file or make a duplicate?`});
		
		new Setting(contentEl)
			.setClass('ddc_ink_primary-2-button-set')
			.addButton( btn => {
				btn.setClass('ddc_ink_button');
				btn.setCta();
				btn.setButtonText('Reference existing file');
				btn.onClick(() => {
					this.close();
					this.instanceAction()
				})
			})
			.addButton( btn => {
				btn.setClass('ddc_ink_button');
				btn.setCta();
				btn.setButtonText('Make duplicate');
				btn.onClick( () => {
					this.close();
					this.duplicateAction()
				})
			});

		new Setting(contentEl)
			.setClass('ddc_ink_modal-actions')
			.addButton( btn => {
				btn.setClass('ddc_ink_backward-button');
				btn.setButtonText('Cancel');
				btn.onClick(() => {
					this.close()
					this.cancelAction();
				})
			})
	}

	onClose() {}
}