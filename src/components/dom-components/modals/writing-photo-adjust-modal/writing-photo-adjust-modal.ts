import { Modal, Setting } from 'obsidian';
import InkPlugin from 'src/main';
import {
	assessPagePhoto,
	pagePhotoToneForAdjustment,
	renderAdjustedPagePhoto,
	type PagePhotoAdjustment,
	type PagePhotoAssessment,
} from 'src/logic/photo-trace/adjust-page-photo';
import { flattenPageIlluminationImageData } from 'src/logic/photo-trace/flatten-page-illumination';
import {
	PHOTO_TRACE_DEFAULT_DETAIL,
	PHOTO_TRACE_DEFAULT_RESOLUTION,
} from 'src/logic/photo-trace/trace-from-raster';
import { fitWritingPhotoStage } from '../writing-photo-crop-modal/writing-photo-crop-modal';
import './writing-photo-adjust-modal.scss';

////////
////////

export type WritingPhotoAdjustChoice =
	| { action: 'convert'; adjustment: PagePhotoAdjustment; detail: number; resolution: number }
	| { action: 'back' }
	| { action: 'cancel' };

/**
 * Second step after the corners are pinned. Shows a downscaled cropped page with
 * the assessed contrast and colour already applied. Convert returns the sliders
 * only; full-res adjust and trace run in the worker. Back returns to the corners.
 * Cancel writes nothing.
 */
export function openWritingPhotoAdjustModal(
	plugin: InkPlugin,
	previewImage: ImageData,
): Promise<WritingPhotoAdjustChoice> {
	const flattenedPreview = flattenPageIlluminationImageData(previewImage);
	const assessment = assessPagePhoto(flattenedPreview);
	return new Promise((resolve) => {
		const modal = new WritingPhotoAdjustModal(plugin, {
			sourceImage: flattenedPreview,
			assessment,
			onChoice: (choice) => resolve(choice),
		});
		modal.open();
	});
}

class WritingPhotoAdjustModal extends Modal {
	private sourceImage: ImageData;
	private assessment: PagePhotoAssessment;
	private adjustment: PagePhotoAdjustment;
	private detail = PHOTO_TRACE_DEFAULT_DETAIL;
	private resolution = PHOTO_TRACE_DEFAULT_RESOLUTION;
	private onChoice: (choice: WritingPhotoAdjustChoice) => void;
	private settled = false;
	private outputCanvas: HTMLCanvasElement | null = null;
	private outputImage: ImageData | null = null;
	private stageCanvas: HTMLCanvasElement | null = null;
	private paintFrame = 0;

	constructor(plugin: InkPlugin, options: {
		sourceImage: ImageData;
		assessment: PagePhotoAssessment;
		onChoice: (choice: WritingPhotoAdjustChoice) => void;
	}) {
		super(plugin.app);
		this.sourceImage = options.sourceImage;
		this.assessment = options.assessment;
		const tone = pagePhotoToneForAdjustment(options.assessment, options.assessment.lightInk);
		this.adjustment = {
			colourStrength: tone.colourStrength,
			contrastStrength: tone.contrastStrength,
			lightInk: options.assessment.lightInk,
		};
		this.onChoice = options.onChoice;
	}

	onOpen(): void {
		const { titleEl, contentEl, modalEl } = this;
		modalEl.addClass('ddc_ink_photo-adjust-modal');
		titleEl.setText('Adjust the page');
		contentEl.createEl('p', {
			text: 'The page is cropped, and the contrast and colour are already set. Detail and Resolution change how closely the ink follows the pen when you convert.',
			cls: 'ddc_ink_photo-adjust__intro',
		});

		const fitted = fitWritingPhotoStage(
			this.sourceImage.width,
			this.sourceImage.height,
			window.innerWidth,
			window.innerHeight,
			560,
		);
		const frame = contentEl.createDiv({ cls: 'ddc_ink_photo-adjust__frame' });
		const stage = frame.createEl('canvas', { cls: 'ddc_ink_photo-adjust__stage' });
		stage.width = fitted.width;
		stage.height = fitted.height;
		this.stageCanvas = stage;

		this.outputCanvas = document.createElement('canvas');
		this.outputCanvas.width = this.sourceImage.width;
		this.outputCanvas.height = this.sourceImage.height;
		const outputContext = this.outputCanvas.getContext('2d');
		if (!outputContext) throw new Error('Could not adjust the page photo');
		this.outputImage = outputContext.createImageData(this.sourceImage.width, this.sourceImage.height);

		let colourSlider: { setValue: (value: number) => void } | null = null;
		let contrastSlider: { setValue: (value: number) => void } | null = null;

		new Setting(contentEl)
			.setName('Colour')
			.setDesc('Pulls the paper toward a neutral grey.')
			.addSlider((slider) => {
				colourSlider = slider;
				slider
					.setLimits(0, 100, 1)
					.setValue(this.adjustment.colourStrength)
					.setDynamicTooltip();
				slider.sliderEl.addEventListener('input', () => {
					this.adjustment.colourStrength = slider.getValue();
					this.schedulePaint();
				});
			});

		new Setting(contentEl)
			.setName('Contrast')
			.setDesc('Pulls the paper and the pen apart.')
			.addSlider((slider) => {
				contrastSlider = slider;
				slider
					.setLimits(0, 100, 1)
					.setValue(this.adjustment.contrastStrength)
					.setDynamicTooltip();
				slider.sliderEl.addEventListener('input', () => {
					this.adjustment.contrastStrength = slider.getValue();
					this.schedulePaint();
				});
			});

		new Setting(contentEl)
			.setName('Detail')
			.setDesc('How closely the ink follows the pen. Highest keeps nearly every pixel and is slower.')
			.addSlider((slider) => {
				slider
					.setLimits(0, 100, 1)
					.setValue(this.detail)
					.setDynamicTooltip();
				slider.sliderEl.addEventListener('input', () => {
					this.detail = slider.getValue();
				});
			});

		new Setting(contentEl)
			.setName('Resolution')
			.setDesc('How many pixels the tracer reads. Default is 1600. Highest is 4096.')
			.addSlider((slider) => {
				slider
					.setLimits(0, 100, 1)
					.setValue(this.resolution)
					.setDynamicTooltip();
				slider.sliderEl.addEventListener('input', () => {
					this.resolution = slider.getValue();
				});
			});

		new Setting(contentEl)
			.setName('Light ink')
			.setDesc('The pen is lighter than the page.')
			.addToggle((toggle) => {
				toggle.setValue(this.adjustment.lightInk);
				toggle.onChange((lightInk) => {
					this.adjustment.lightInk = lightInk;
					const tone = pagePhotoToneForAdjustment(this.assessment, lightInk);
					this.adjustment.colourStrength = tone.colourStrength;
					this.adjustment.contrastStrength = tone.contrastStrength;
					colourSlider?.setValue(tone.colourStrength);
					contrastSlider?.setValue(tone.contrastStrength);
					this.schedulePaint();
				});
			});

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText('Back');
				button.onClick(() => this.finish({ action: 'back' }));
			})
			.addButton((button) => {
				button.setButtonText('Cancel');
				button.onClick(() => this.finish({ action: 'cancel' }));
			})
			.addButton((button) => {
				button.setButtonText('Convert to handwriting');
				button.setCta();
				button.onClick(() => {
					this.finish({
						action: 'convert',
						adjustment: { ...this.adjustment },
						detail: this.detail,
						resolution: this.resolution,
					});
				});
			});

		this.paint();
	}

	onClose(): void {
		if (this.paintFrame) window.cancelAnimationFrame(this.paintFrame);
		this.contentEl.empty();
		if (!this.settled) this.onChoice({ action: 'cancel' });
		this.settled = true;
	}

	private schedulePaint(): void {
		if (this.paintFrame) return;
		this.paintFrame = window.requestAnimationFrame(() => {
			this.paintFrame = 0;
			this.paint();
		});
	}

	private paint(): void {
		if (!this.outputCanvas || !this.outputImage || !this.stageCanvas) return;
		const outputContext = this.outputCanvas.getContext('2d');
		const stageContext = this.stageCanvas.getContext('2d');
		if (!outputContext || !stageContext) return;
		renderAdjustedPagePhoto(
			this.sourceImage,
			pagePhotoToneForAdjustment(this.assessment, this.adjustment.lightInk),
			this.adjustment,
			this.outputImage,
		);
		outputContext.putImageData(this.outputImage, 0, 0);
		stageContext.drawImage(this.outputCanvas, 0, 0, this.stageCanvas.width, this.stageCanvas.height);
	}

	private finish(choice: WritingPhotoAdjustChoice): void {
		if (this.settled) return;
		this.settled = true;
		this.close();
		this.onChoice(choice);
	}
}
