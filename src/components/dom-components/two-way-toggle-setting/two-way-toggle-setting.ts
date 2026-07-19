import './two-way-toggle-setting.scss';
import { ButtonComponent, Setting } from 'obsidian';

//////////////
//////////////

/**
 * Segmented two-option control (same visuals as dominant hand).
 * Call {@link setOptionPair} before {@link setValue} or user interaction.
 */
export class TwoWayToggleSetting<T extends string = string> {
	containerEl: HTMLElement;
	setting: Setting;
	rightButton: ButtonComponent;
	leftButton: ButtonComponent;
	private startValue?: T;
	private endValue?: T;
	private onChangeHandler?: (value: T) => void | Promise<void>;

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
			button.onClick(() => this.selectStart());
		});

		this.setting.addButton((button) => {
			this.leftButton = button;
			button.buttonEl.classList.add(
				'ddc_ink_two-way-toggle-option',
				'ddc_ink_two-way-toggle-option--end',
			);
			button.buttonEl.setAttribute('aria-pressed', 'false');
			button.onClick(() => this.selectEnd());
		});

		const trackEl = this.setting.controlEl.createDiv('ddc_ink_two-way-toggle-track');
		trackEl.appendChild(this.rightButton.buttonEl);
		trackEl.appendChild(this.leftButton.buttonEl);
	}

	setName(name: string): this {
		this.setting.setName(name);
		return this;
	}

	setDesc(desc: string): this {
		this.setting.setDesc(desc);
		return this;
	}

	/**
	 * @param startLabel — first segment (left); maps to `startValue`
	 * @param endLabel — second segment (right); maps to `endValue`
	 */
	setOptionPair(startValue: T, startLabel: string, endValue: T, endLabel: string): this {
		this.startValue = startValue;
		this.endValue = endValue;
		this.rightButton.setButtonText(startLabel);
		this.leftButton.setButtonText(endLabel);
		return this;
	}

	setValue(value: T): this {
		if (this.startValue === undefined || this.endValue === undefined) {
			throw new Error('TwoWayToggleSetting: call setOptionPair before setValue');
		}
		this.updateActiveState(value);
		return this;
	}

	onChange(handler: (value: T) => void | Promise<void>): this {
		this.onChangeHandler = handler;
		return this;
	}

	private selectStart(): void {
		const { startValue, endValue } = this;
		if (startValue === undefined || endValue === undefined) {
			throw new Error('TwoWayToggleSetting: call setOptionPair before use');
		}
		this.updateActiveState(startValue);
		void this.onChangeHandler?.(startValue);
	}

	private selectEnd(): void {
		const { startValue, endValue } = this;
		if (startValue === undefined || endValue === undefined) {
			throw new Error('TwoWayToggleSetting: call setOptionPair before use');
		}
		this.updateActiveState(endValue);
		void this.onChangeHandler?.(endValue);
	}

	private updateActiveState(value: T): void {
		const isStart = value === this.startValue;
		this.rightButton.buttonEl.classList.toggle('ddc_ink_two-way-toggle-option--active', isStart);
		this.rightButton.buttonEl.setAttribute('aria-pressed', String(isStart));
		this.leftButton.buttonEl.classList.toggle('ddc_ink_two-way-toggle-option--active', !isStart);
		this.leftButton.buttonEl.setAttribute('aria-pressed', String(!isStart));
	}
}
