import './toggle-accordion-setting.scss';
import { Setting, ToggleComponent } from "obsidian";

//////////////
//////////////

export class ToggleAccordionSetting {
	containerEl: HTMLElement;
	toggleSetting: Setting;
	toggle: ToggleComponent;
	sectionEl: HTMLElement;
	sectionHeaderEl: HTMLElement;
	sectionContentEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.containerEl = containerEl;
		this.sectionEl = this.containerEl.createDiv('ddc_ink_toggle-accordion');
		this.sectionHeaderEl = this.sectionEl.createDiv('ddc_ink_toggle-accordion-header');
		this.sectionContentEl = this.sectionEl.createDiv('ddc_ink_toggle-accordion-content');
		this.toggleSetting = new Setting(this.sectionHeaderEl)
			.setClass('ddc_ink_setting')
			.addToggle((toggle) => this.toggle = toggle);
		return this;
	}

	setName(name: string): ToggleAccordionSetting {
		this.toggleSetting.setName(name);
		return this;
	}

	setDesc(desc: string): ToggleAccordionSetting {
		this.toggleSetting.setDesc(desc);
		return this;
	}

	setExpanded(expanded: boolean): ToggleAccordionSetting {
		this.toggle.setValue(expanded);
		if(expanded) {
			this.sectionEl.classList.add('ddc_ink_expanded');
			} else {
			this.sectionEl.classList.remove('ddc_ink_expanded');
		}
		return this;
	}

	onToggle(toggleHandler: (value: boolean) => any): ToggleAccordionSetting {
		this.toggle.onChange(toggleHandler);
		return this;
	}

	setContent(contentHandler: (container: HTMLElement) => any) {
		contentHandler(this.sectionContentEl);
		return this;
	}

}