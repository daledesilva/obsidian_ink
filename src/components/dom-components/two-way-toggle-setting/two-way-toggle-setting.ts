import './two-way-toggle-setting.scss';
import { ButtonComponent, Setting } from 'obsidian';
import { DominantHand } from 'src/types/plugin-settings_0_5_0';

//////////////
//////////////

export class TwoWayToggleSetting {
	containerEl: HTMLElement;
	setting: Setting;
	rightButton: ButtonComponent;
	leftButton: ButtonComponent;
	private onChangeHandler?: (value: DominantHand) => void | Promise<void>;

	constructor(containerEl: HTMLElement) {
		this.containerEl = containerEl;
		this.setting = new Setting(containerEl)
			.setClass('ddc_ink_setting')
			.setClass('ddc_ink_two-way-toggle-setting');

		this.setting.addButton((button) => {
			this.rightButton = button;
			button.buttonEl.classList.add(
				'ddc_ink_two-way-toggle-option',
				'ddc_ink_two-way-toggle-option--start',
			);
			button.buttonEl.setAttribute('aria-pressed', 'false');
			button.onClick(() => this.selectValue('right'));
		});

		this.setting.addButton((button) => {
			this.leftButton = button;
			button.buttonEl.classList.add(
				'ddc_ink_two-way-toggle-option',
				'ddc_ink_two-way-toggle-option--end',
			);
			button.buttonEl.setAttribute('aria-pressed', 'false');
			button.onClick(() => this.selectValue('left'));
		});

		const trackEl = this.setting.controlEl.createDiv('ddc_ink_two-way-toggle-track');
		trackEl.appendChild(this.rightButton.buttonEl);
		trackEl.appendChild(this.leftButton.buttonEl);
	}

	setName(name: string): TwoWayToggleSetting {
		this.setting.setName(name);
		return this;
	}

	setDesc(desc: string): TwoWayToggleSetting {
		this.setting.setDesc(desc);
		return this;
	}

	setOptions(rightLabel: string, leftLabel: string): TwoWayToggleSetting {
		this.rightButton.setButtonText(rightLabel);
		this.leftButton.setButtonText(leftLabel);
		return this;
	}

	setValue(value: DominantHand): TwoWayToggleSetting {
		this.updateActiveState(value);
		return this;
	}

	onChange(handler: (value: DominantHand) => void | Promise<void>): TwoWayToggleSetting {
		this.onChangeHandler = handler;
		return this;
	}

	private selectValue(value: DominantHand): void {
		this.updateActiveState(value);
		void this.onChangeHandler?.(value);
	}

	private updateActiveState(value: DominantHand): void {
		const isRight = value === 'right';
		this.rightButton.buttonEl.classList.toggle('ddc_ink_two-way-toggle-option--active', isRight);
		this.rightButton.buttonEl.setAttribute('aria-pressed', String(isRight));
		this.leftButton.buttonEl.classList.toggle('ddc_ink_two-way-toggle-option--active', !isRight);
		this.leftButton.buttonEl.setAttribute('aria-pressed', String(!isRight));
	}
}
