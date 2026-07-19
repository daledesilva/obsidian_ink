import './three-way-toggle-setting.scss';
import { ButtonComponent, Setting } from 'obsidian';

//////////////
//////////////

export interface ThreeWayToggleOption<T extends string = string> {
	value: T;
	label: string;
}

const THREE_WAY_POSITION_CLASSES = [
	'ddc_ink_three-way-toggle-option--start',
	'ddc_ink_three-way-toggle-option--middle',
	'ddc_ink_three-way-toggle-option--end',
] as const;

/**
 * Segmented three-option control (same visuals as two-way toggle / dominant hand).
 * Call {@link setOptions} before {@link setValue} or user interaction.
 */
export class ThreeWayToggleSetting<T extends string = string> {
	containerEl: HTMLElement;
	setting: Setting;
	private buttons: ButtonComponent[] = [];
	private options: ThreeWayToggleOption<T>[] = [];
	private onChangeHandler?: (value: T) => void | Promise<void>;

	constructor(containerEl: HTMLElement) {
		this.containerEl = containerEl;
		this.setting = new Setting(containerEl)
			.setClass('ddc_ink_setting')
			.setClass('ddc_ink_three-way-toggle-setting');

		for (let i = 0; i < 3; i++) {
			const buttonIndex = i;
			this.setting.addButton((button) => {
				this.buttons.push(button);
				button.buttonEl.classList.add(
					'ddc_ink_three-way-toggle-option',
					THREE_WAY_POSITION_CLASSES[buttonIndex],
				);
				button.buttonEl.setAttribute('aria-pressed', 'false');
				button.onClick(() => {
					const option = this.options[buttonIndex];
					if (option) this.selectOption(option.value);
				});
			});
		}

		const trackEl = this.setting.controlEl.createDiv('ddc_ink_three-way-toggle-track');
		for (const button of this.buttons) {
			trackEl.appendChild(button.buttonEl);
		}
	}

	setName(name: string): this {
		this.setting.setName(name);
		return this;
	}

	setDesc(desc: string | DocumentFragment): this {
		this.setting.setDesc(desc);
		return this;
	}

	/** Options render left-to-right in array order. */
	setOptions(options: ThreeWayToggleOption<T>[]): this {
		if (options.length !== 3) {
			throw new Error('ThreeWayToggleSetting: exactly three options are required');
		}
		this.options = options;
		for (let i = 0; i < options.length; i++) {
			this.buttons[i].setButtonText(options[i].label);
		}
		return this;
	}

	setValue(value: T): this {
		if (this.options.length !== 3) {
			throw new Error('ThreeWayToggleSetting: call setOptions before setValue');
		}
		this.updateActiveState(value);
		return this;
	}

	onChange(handler: (value: T) => void | Promise<void>): this {
		this.onChangeHandler = handler;
		return this;
	}

	private selectOption(value: T): void {
		if (this.options.length !== 3) {
			throw new Error('ThreeWayToggleSetting: call setOptions before use');
		}
		this.updateActiveState(value);
		void this.onChangeHandler?.(value);
	}

	private updateActiveState(value: T): void {
		for (let i = 0; i < this.options.length; i++) {
			const isActive = this.options[i].value === value;
			const button = this.buttons[i];
			button.buttonEl.classList.toggle('ddc_ink_three-way-toggle-option--active', isActive);
			button.buttonEl.setAttribute('aria-pressed', String(isActive));
		}
	}
}
