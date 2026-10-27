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
	PHOTO_TRACE_DEFAULT_INK_SENSITIVITY,
	autoSelectPhotoInkSensitivity,
	buildPhotoInkMask,
	photoTraceSauvolaK,
} from 'src/logic/photo-trace/trace-from-raster';
import './writing-photo-adjust-modal.scss';

////////
////////

export type WritingPhotoConvertTarget = 'writing' | 'drawing';

export type WritingPhotoAdjustChoice =
	| {
		action: 'convert';
		target: WritingPhotoConvertTarget;
		adjustment: PagePhotoAdjustment;
		inkSensitivity: number;
		noiseCleanup: boolean;
	}
	| { action: 'back' }
	| { action: 'cancel' };

/**
 * Second step after the corners are pinned. Shows a live traced-ink preview with
 * auto-tuned Colour, Contrast, and Ink sensitivity under a collapsible "Adjust detection"
 * section. Convert returns the adjustment and sensitivity; full-res trace runs in the worker.
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
	private inkSensitivity = PHOTO_TRACE_DEFAULT_INK_SENSITIVITY;
	private noiseCleanup = true;
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
		const initial = autoTuneAdjustmentAndSensitivity(
			options.sourceImage,
			options.assessment,
			options.assessment.lightInk,
		);
		this.adjustment = initial.adjustment;
		this.inkSensitivity = initial.inkSensitivity;
		this.onChoice = options.onChoice;
	}

	onOpen(): void {
		const { titleEl, contentEl, modalEl } = this;
		modalEl.addClass('ddc_ink_photo-adjust-modal');
		titleEl.setText('How your photo will convert into ink');

		const frame = contentEl.createDiv({ cls: 'ddc_ink_photo-adjust__frame' });
		const stage = frame.createEl('canvas', { cls: 'ddc_ink_photo-adjust__stage' });
		stage.width = this.sourceImage.width;
		stage.height = this.sourceImage.height;
		stage.style.aspectRatio = `${this.sourceImage.width} / ${this.sourceImage.height}`;
		stage.style.maxWidth = `min(100%, calc(56vh * ${this.sourceImage.width} / ${Math.max(1, this.sourceImage.height)}))`;
		this.stageCanvas = stage;

		this.outputCanvas = document.createElement('canvas');
		this.outputCanvas.width = this.sourceImage.width;
		this.outputCanvas.height = this.sourceImage.height;
		const outputContext = this.outputCanvas.getContext('2d');
		if (!outputContext) throw new Error('Could not adjust the page photo');
		this.outputImage = outputContext.createImageData(this.sourceImage.width, this.sourceImage.height);

		const detailsEl = contentEl.createEl('details', { cls: 'ddc_ink_photo-adjust__details' });
		detailsEl.createEl('summary', {
			text: 'Adjust detection',
			cls: 'ddc_ink_photo-adjust__summary',
		});
		const detailsBodyEl = detailsEl.createDiv({ cls: 'ddc_ink_photo-adjust__details-body' });

		new Setting(detailsBodyEl)
			.setName('Colour')
			.setDesc('Pulls the paper toward a neutral grey.')
			.addSlider((slider) => {
				slider
					.setLimits(0, 100, 1)
					.setValue(this.adjustment.colourStrength)
					.setDynamicTooltip();
				slider.sliderEl.addEventListener('input', () => {
					this.adjustment.colourStrength = slider.getValue();
					this.schedulePaint();
				});
			});

		new Setting(detailsBodyEl)
			.setName('Contrast')
			.setDesc('Pulls the paper and the pen apart.')
			.addSlider((slider) => {
				slider
					.setLimits(0, 100, 1)
					.setValue(this.adjustment.contrastStrength)
					.setDynamicTooltip();
				slider.sliderEl.addEventListener('input', () => {
					this.adjustment.contrastStrength = slider.getValue();
					this.schedulePaint();
				});
			});

		new Setting(detailsBodyEl)
			.setName('Ink sensitivity')
			.setDesc('How much faint pen is kept. Higher keeps lighter strokes.')
			.addSlider((slider) => {
				slider
					.setLimits(0, 100, 1)
					.setValue(this.inkSensitivity)
					.setDynamicTooltip();
				slider.sliderEl.addEventListener('input', () => {
					this.inkSensitivity = slider.getValue();
					this.schedulePaint();
				});
			});

		new Setting(detailsBodyEl)
			.setName('Noise cleanup')
			.setDesc('Removes small isolated speckles of paper and margin noise.')
			.addToggle((toggle) => {
				toggle.setValue(this.noiseCleanup);
				toggle.onChange((noiseCleanup) => {
					this.noiseCleanup = noiseCleanup;
					this.schedulePaint();
				});
			});

		const footerSetting = new Setting(contentEl);
		footerSetting.settingEl.addClass('ddc_ink_photo-adjust__footer');
		footerSetting
			.addButton((button) => {
				button.setButtonText('Back');
				button.buttonEl.addClass('ddc_ink_photo-adjust__back-btn');
				button.onClick(() => this.finish({ action: 'back' }));
			})
			.addButton((button) => {
				button.setButtonText('Cancel');
				button.onClick(() => this.finish({ action: 'cancel' }));
			})
			.addButton((button) => {
				button.setButtonText('Convert to drawing');
				button.setCta();
				button.onClick(() => {
					this.finish({
						action: 'convert',
						target: 'drawing',
						adjustment: { ...this.adjustment },
						inkSensitivity: this.inkSensitivity,
						noiseCleanup: this.noiseCleanup,
					});
				});
			})
			.addButton((button) => {
				button.setButtonText('Convert to handwriting');
				button.setCta();
				button.onClick(() => {
					this.finish({
						action: 'convert',
						target: 'writing',
						adjustment: { ...this.adjustment },
						inkSensitivity: this.inkSensitivity,
						noiseCleanup: this.noiseCleanup,
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
		this.paintInkMask(this.outputImage);
		outputContext.putImageData(this.outputImage, 0, 0);
		stageContext.drawImage(this.outputCanvas, 0, 0, this.stageCanvas.width, this.stageCanvas.height);
	}

	/** Replaces the adjusted photo with the cleaned Sauvola mask so breaks and noise are visible before convert. */
	private paintInkMask(image: ImageData): void {
		const gray = grayscaleFromImageData(image);
		const mask = buildPhotoInkMask(
			gray,
			image.width,
			image.height,
			photoTraceSauvolaK(this.inkSensitivity),
			true,
			this.noiseCleanup,
		);
		const pixels = image.data;
		const pixelCount = image.width * image.height;
		for (let index = 0; index < pixelCount; index++) {
			const offset = index * 4;
			const ink = mask[index] === 1 ? 0 : 255;
			pixels[offset] = ink;
			pixels[offset + 1] = ink;
			pixels[offset + 2] = ink;
			pixels[offset + 3] = 255;
		}
	}

	private finish(choice: WritingPhotoAdjustChoice): void {
		if (this.settled) return;
		this.settled = true;
		this.close();
		this.onChoice(choice);
	}
}

/**
 * Evaluates whether the assessed Colour/Contrast stretch introduces more pepper noise
 * than the raw illumination-flattened image, and picks the cleanest combination along
 * with the matching Ink sensitivity.
 */
function autoTuneAdjustmentAndSensitivity(
	sourceImage: ImageData,
	assessment: PagePhotoAssessment,
	lightInk: boolean,
): { adjustment: PagePhotoAdjustment; inkSensitivity: number } {
	const tone = pagePhotoToneForAdjustment(assessment, lightInk);
	const zeroAdjustment: PagePhotoAdjustment = {
		colourStrength: 0,
		contrastStrength: 0,
		lightInk,
	};
	const scratch = new ImageData(sourceImage.width, sourceImage.height);
	renderAdjustedPagePhoto(sourceImage, tone, zeroAdjustment, scratch);
	const zeroGray = grayscaleFromImageData(scratch);
	const zeroSensitivity = autoSelectPhotoInkSensitivity(
		zeroGray,
		sourceImage.width,
		sourceImage.height,
	);

	if (tone.colourStrength === 0 && tone.contrastStrength === 0) {
		return { adjustment: zeroAdjustment, inkSensitivity: zeroSensitivity };
	}

	const toneAdjustment: PagePhotoAdjustment = {
		colourStrength: tone.colourStrength,
		contrastStrength: tone.contrastStrength,
		lightInk,
	};
	renderAdjustedPagePhoto(sourceImage, tone, toneAdjustment, scratch);
	const toneGray = grayscaleFromImageData(scratch);
	const toneSensitivity = autoSelectPhotoInkSensitivity(
		toneGray,
		sourceImage.width,
		sourceImage.height,
	);

	// Prefer 0/0 unless the tone stretch actually needs a higher sensitivity (meaning
	// the raw image was too flat for Sauvola to separate strokes without stretching).
	if (zeroSensitivity >= 50) {
		return { adjustment: zeroAdjustment, inkSensitivity: zeroSensitivity };
	}
	return { adjustment: toneAdjustment, inkSensitivity: toneSensitivity };
}

function grayscaleFromImageData(image: ImageData): Uint8Array {
	const pixelCount = image.width * image.height;
	const gray = new Uint8Array(pixelCount);
	const pixels = image.data;
	for (let index = 0; index < pixelCount; index++) {
		const offset = index * 4;
		gray[index] = Math.round(
			0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2],
		);
	}
	return gray;
}
