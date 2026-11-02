import { Modal, setIcon, Setting } from 'obsidian';
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import InkPlugin from 'src/main';
import type { PagePoint } from 'src/logic/photo-trace/find-page-quad';
import {
	rotateImageDataQuarterTurns,
	rotatePageCornersQuarterTurns,
} from 'src/logic/photo-trace/rotate-image-data';
import type { InkPhotoConvertTarget } from 'src/logic/photo-trace/photo-convert-target';
import type { PagePhotoAdjustment } from 'src/logic/photo-trace/adjust-page-photo';
import {
	hitCropEdge,
	nearestCornerIndex,
	clampSharedCornerDelta,
	clampCropValue,
	normalizeQuarterTurns,
	CROP_CORNER_EXCLUSION_SCREEN_PX,
	CROP_EDGE_HIT_SCREEN_PX,
	type CropEdge,
} from 'src/logic/photo-trace/crop-quad-pointer';
import { canvasFromRgba } from 'src/logic/photo-trace/run-photo-trace';
import { PhotoTraceWorkerClient } from 'src/logic/photo-trace/photo-trace-worker-client';
import { PHOTO_TRACE_DEFAULT_INK_SENSITIVITY } from 'src/logic/photo-trace/trace-from-raster';
import { PhotoTargetToggle } from 'src/components/dom-components/photo-target-toggle/photo-target-toggle';
import { setPhotoTraceChevronLabel } from 'src/components/dom-components/modals/photo-trace-chevron-button';
import './writing-photo-page-modal.scss';

////////
////////

/** The page shape and detection settings one photo ends up with. */
export interface PhotoPageSettings {
	corners: [PagePoint, PagePoint, PagePoint, PagePoint];
	/** Clockwise 90° steps from the photo as picked. 0–3. */
	quarterTurnsClockwise: number;
	adjustment: PagePhotoAdjustment;
	inkSensitivity: number;
	noiseCleanup: boolean;
}

/**
 * What the page step sends back. Cancel leaves the whole batch; Convert all finishes this
 * photo with the settings on screen and every photo still waiting.
 */
export type WritingPhotoPageChoice =
	| ({ action: 'convert-all' } & PhotoPageSettings)
	/** Keeps the current page settings, then walks to another image or the grid. */
	| ({ action: 'previous' } & PhotoPageSettings)
	| ({ action: 'next' } & PhotoPageSettings)
	| ({ action: 'photos' } & PhotoPageSettings)
	| { action: 'cancel' };

export interface OpenWritingPhotoPageModalOptions {
	plugin: InkPlugin;
	/** The photo as picked, before any turn. */
	sourceImage: ImageData;
	defaultCorners: [PagePoint, PagePoint, PagePoint, PagePoint];
	quarterTurnsClockwise?: number;
	/** Detection settings from an earlier visit, so a revisit opens where it was left. */
	initialSettings?: Omit<PhotoPageSettings, 'corners' | 'quarterTurnsClockwise'> | null;
	/** The photo's chosen destination, already set on the grid. */
	currentTarget: InkPhotoConvertTarget;
	/** Fires as soon as the toggle changes so the batch keeps the choice. */
	onTargetChange?: (target: InkPhotoConvertTarget) => void;
	/** Centred count above the photo, such as "2 of 5 photos". */
	positionLabel?: string;
	/** False on the first photo, where Prev image does not take clicks. */
	canGoPrevious?: boolean;
	/** False on the last photo. Next is disabled rather than replaced. */
	canGoNext?: boolean;
}

interface PageTargetRowProps {
	initialTarget: InkPhotoConvertTarget;
	onTargetChange?: (target: InkPhotoConvertTarget) => void;
}

/**
 * Writing/Drawing pair for the page step. It owns its own state because this dialog is
 * host DOM, so a change here must repaint the pair itself.
 */
const PageTargetRow: React.FC<PageTargetRowProps> = (props) => {
	const [target, setTarget] = React.useState<InkPhotoConvertTarget>(props.initialTarget);
	return (
		<PhotoTargetToggle
			target={target}
			label='Convert this photo to'
			onChange={(nextTarget) => {
				setTarget(nextTarget);
				props.onTargetChange?.(nextTarget);
			}}
		/>
	);
};

/**
 * One screen for everything about a photo's page: turn it, drag the pins, and tune how
 * the ink is detected. Corners and detection used to be two dialogs, which made the
 * thumbnail's pencil ambiguous, because it skipped the pins.
 *
 * While a pin or a bar is held the stage shows the plain photo, so the edge being aimed
 * at is not hidden behind the adjusted version. On release the whole photo is re-rendered
 * with the current detection settings, and the crop quad stays overlaid on top. The page
 * is not warped or cropped here; that happens when the photo is converted.
 */
export function openWritingPhotoPageModal(
	options: OpenWritingPhotoPageModalOptions,
): Promise<WritingPhotoPageChoice> {
	return new Promise((resolve) => {
		const modal = new WritingPhotoPageModal(options, (choice) => resolve(choice));
		modal.open();
	});
}

class WritingPhotoPageModal extends Modal {
	private options: OpenWritingPhotoPageModalOptions;
	private onChoice: (choice: WritingPhotoPageChoice) => void;
	private settled = false;

	// Photo state
	private baseImage: ImageData;
	private quarterTurnsClockwise: number;
	private displayImage: ImageData;
	private imageWidth: number;
	private imageHeight: number;
	private corners: [PagePoint, PagePoint, PagePoint, PagePoint];
	private cornersAtDragStart: [PagePoint, PagePoint, PagePoint, PagePoint];
	private turnsAtDragStart: number;
	private sizeAtDragStart: { width: number; height: number };

	// Detection state
	private adjustment: PagePhotoAdjustment;
	private inkSensitivity = PHOTO_TRACE_DEFAULT_INK_SENSITIVITY;
	private noiseCleanup = true;
	/** True once detection settings came from the worker's auto-tune on first open. */
	private hasWorkerTunedSettings = false;
	private isAdjusting = false;
	/** Owns the worker; preview renders run there so the dialog opens instantly. */
	private worker: PhotoTraceWorkerClient;

	// DOM
	private imageEl: HTMLImageElement | null = null;
	/** The processed photo, layered over the plain one so it can fade in. */
	private processedImageEl: HTMLImageElement | null = null;
	private stageEl: HTMLDivElement | null = null;
	private overlayEl: SVGSVGElement | null = null;
	private outsideMaskEl: SVGPathElement | null = null;
	private polygonEl: SVGPolygonElement | null = null;
	/** Spinner shown while the worker renders a preview. */
	private busyEl: HTMLDivElement | null = null;
	private handles: HTMLDivElement[] = [];
	private targetToggleRoot: Root | null = null;
	private ownedAdjustedUrl: string | null = null;
	private ownedPlainUrl: string | null = null;
	private paintGeneration = 0;
	/** Pending slider repaint frame, so a drag queues one render per frame at most. */
	private pendingRepaintFrame = 0;

	constructor(options: OpenWritingPhotoPageModalOptions, onChoice: (choice: WritingPhotoPageChoice) => void) {
		super(options.plugin.app);
		const quarterTurnsClockwise = options.quarterTurnsClockwise ?? 0;
		this.options = options;
		this.onChoice = onChoice;
		this.baseImage = options.sourceImage;
		this.quarterTurnsClockwise = quarterTurnsClockwise;
		this.displayImage = rotateImageDataQuarterTurns(options.sourceImage, quarterTurnsClockwise);
		this.imageWidth = this.displayImage.width;
		this.imageHeight = this.displayImage.height;
		this.corners = options.defaultCorners.map((point) => ({ ...point })) as [
			PagePoint,
			PagePoint,
			PagePoint,
			PagePoint,
		];
		this.cornersAtDragStart = this.corners.map((point) => ({ ...point })) as [
			PagePoint,
			PagePoint,
			PagePoint,
			PagePoint,
		];
		this.turnsAtDragStart = quarterTurnsClockwise;
		this.sizeAtDragStart = { width: this.imageWidth, height: this.imageHeight };
		this.worker = new PhotoTraceWorkerClient(options.plugin);

		if (options.initialSettings) {
			this.adjustment = { ...options.initialSettings.adjustment };
			this.inkSensitivity = options.initialSettings.inkSensitivity;
			this.noiseCleanup = options.initialSettings.noiseCleanup;
		} else {
			// Start from the same automatic guess the old adjust step made, measured on the
			// flattened photo. Deferred until the stage exists so opening stays quick.
			this.adjustment = { colourStrength: 0, contrastStrength: 0, lightInk: false };
		}
	}

	onOpen(): void {
		const { titleEl, contentEl, modalEl } = this;
		modalEl.addClass('ddc_ink_photo-page-modal');
		// Hook for ink-button-hover.scss so plain dialog buttons hover on macOS.
		modalEl.addClass('ddc_ink_modal');
		titleEl.setText('Adjust page processing');
		if (this.options.positionLabel) {
			// Same size and colour as the count on the thumbnail grid, centred above the photo.
			contentEl.createDiv({
				text: this.options.positionLabel,
				cls: 'ddc_ink_photo-page__count',
			});
		}

		const frame = contentEl.createDiv({ cls: 'ddc_ink_photo-page__frame' });
		const stage = frame.createDiv({ cls: 'ddc_ink_photo-page__stage' });
		this.stageEl = stage;
		this.applyStageSize();

		/*
		 * Two stacked images. The bottom one is always the plain photo, shown immediately
		 * so the dialog opens without waiting. The top one holds the processed version and
		 * fades in over it when the worker finishes.
		 */
		const image = stage.createEl('img', { cls: 'ddc_ink_photo-page__image' });
		image.draggable = false;
		this.imageEl = image;

		const processedImage = stage.createEl('img', {
			cls: 'ddc_ink_photo-page__image ddc_ink_photo-page__image--processed',
		});
		processedImage.draggable = false;
		this.processedImageEl = processedImage;

		/*
		 * Spinner shown while a preview render is in flight. Processing a full photo takes a
		 * moment, and without a sign of work a slider drag looks like it did nothing.
		 */
		const busyEl = stage.createDiv({ cls: 'ddc_ink_photo-page__busy' });
		busyEl.setAttribute('aria-hidden', 'true');
		setIcon(busyEl, 'loader-2');
		this.busyEl = busyEl;

		const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		overlay.setAttribute('class', 'ddc_ink_photo-page__overlay');
		this.overlayEl = overlay;
		// Even-odd path dims the photo outside the selected quad with the theme background.
		const outsideMask = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		outsideMask.setAttribute('class', 'ddc_ink_photo-page__outside-mask');
		outsideMask.setAttribute('fill', 'var(--background-primary)');
		outsideMask.setAttribute('fill-opacity', '0.5');
		outsideMask.setAttribute('fill-rule', 'evenodd');
		this.outsideMaskEl = outsideMask;
		overlay.appendChild(outsideMask);
		const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
		polygon.setAttribute('fill', 'none');
		polygon.setAttribute('stroke', 'var(--interactive-accent)');
		this.polygonEl = polygon;
		overlay.appendChild(polygon);
		stage.appendChild(overlay);

		this.handles = [];
		for (let index = 0; index < 4; index++) {
			const handle = stage.createDiv({ cls: 'ddc_ink_photo-page__handle' });
			this.handles.push(handle);
			handle.addEventListener('pointerdown', (event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				// The circle owns this press so the stage does not treat it as a side or a jump.
				event.stopPropagation();
				this.beginCornerDrag(index, event.pointerId);
			});
		}

		// Presses that miss a circle hit the stage. A press near the middle of a side
		// slides that side; anywhere else jumps the nearest circle and follows the pointer.
		stage.addEventListener('pointerdown', (event) => {
			if (event.button !== 0) return;
			const target = event.target;
			if (target instanceof HTMLElement && target.classList.contains('ddc_ink_photo-page__handle')) return;
			event.preventDefault();
			const point = this.pagePointFromPointer(event);
			if (!point) return;
			const edge = hitCropEdge(
				point,
				this.corners,
				this.screenPixelsInPhoto(CROP_EDGE_HIT_SCREEN_PX),
				this.screenPixelsInPhoto(CROP_CORNER_EXCLUSION_SCREEN_PX),
			);
			if (edge) {
				this.beginEdgeDrag(edge, event.pointerId, point);
				return;
			}
			this.beginNearestCornerDrag(event.pointerId, point);
		});

		this.buildControls(contentEl);
		this.refreshOverlay();
		// Show the plain photo straight away, then swap in the processed one when ready.
		this.showPlainPreview(true);
		this.requestProcessedPreview();
		this.buildFooter(contentEl);
	}

	onClose(): void {
		this.paintGeneration += 1;
		if (this.pendingRepaintFrame) window.cancelAnimationFrame(this.pendingRepaintFrame);
		this.pendingRepaintFrame = 0;
		this.worker.cancel();
		if (this.ownedAdjustedUrl) URL.revokeObjectURL(this.ownedAdjustedUrl);
		if (this.ownedPlainUrl) URL.revokeObjectURL(this.ownedPlainUrl);
		this.ownedAdjustedUrl = null;
		this.ownedPlainUrl = null;
		this.targetToggleRoot?.unmount();
		this.targetToggleRoot = null;
		this.contentEl.empty();
		if (!this.settled) this.onChoice({ action: 'cancel' });
		this.settled = true;
	}

	/** Target toggle, rotate buttons, then the detection sliders underneath. */
	private buildControls(contentEl: HTMLElement): void {
		// Toggle and rotate share one row, with rotate pushed to the far side.
		const controlRow = contentEl.createDiv({ cls: 'ddc_ink_photo-page__controls' });
		const targetRow = controlRow.createDiv({ cls: 'ddc_ink_photo-page__target' });
		this.targetToggleRoot = createRoot(targetRow);
		this.targetToggleRoot.render(
			<PageTargetRow
				initialTarget={this.options.currentTarget}
				onTargetChange={(nextTarget) => this.options.onTargetChange?.(nextTarget)}
			/>,
		);
		const rotateRow = controlRow.createDiv({ cls: 'ddc_ink_photo-page__rotate' });
		this.addRotateButton(rotateRow, 'rotate-ccw', 'Rotate left', -1);
		this.addRotateButton(rotateRow, 'rotate-cw', 'Rotate right', 1);

		const detailsEl = contentEl.createEl('details', { cls: 'ddc_ink_photo-page__details' });
		const summaryEl = detailsEl.createEl('summary', { cls: 'ddc_ink_photo-page__summary' });
		summaryEl.createSpan({ text: 'Adjust image processing' });
		// The browser marker sits on the left. A chevron after the words is the
		// disclosure, and it turns down once the section is open.
		const summaryChevronEl = summaryEl.createSpan({ cls: 'ddc_ink_photo-page__summary-chevron' });
		summaryChevronEl.setAttribute('aria-hidden', 'true');
		setIcon(summaryChevronEl, 'chevron-right');
		const detailsBodyEl = detailsEl.createDiv({ cls: 'ddc_ink_photo-page__details-body' });

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
					this.scheduleAdjustedImage();
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
					this.scheduleAdjustedImage();
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
					this.scheduleAdjustedImage();
				});
			});

		new Setting(detailsBodyEl)
			.setName('Noise cleanup')
			.setDesc('Removes small isolated speckles of paper and margin noise.')
			.addToggle((toggle) => {
				toggle.setValue(this.noiseCleanup);
				toggle.onChange((noiseCleanup) => {
					this.noiseCleanup = noiseCleanup;
					this.scheduleAdjustedImage();
				});
			});
	}

	/**
	 * One footer row: Thumbnails at the far left, Prev image and Next image centred
	 * between that and Convert all.
	 *
	 * The title-bar close already leaves the batch, so Cancel is not repeated here.
	 * Thumbnails returns to the grid and keeps the page settings. Prev and Next stay
	 * labelled the same on every photo; at either end of the batch the button stops
	 * taking clicks instead of changing into a second way back.
	 *
	 * The pencil on a thumbnail opens this same footer, already on that photo.
	 */
	private buildFooter(contentEl: HTMLElement): void {
		const footerRow = new Setting(contentEl);
		footerRow.settingEl.addClass('ddc_ink_photo-page__footer');
		footerRow.addButton((button) => {
			button.buttonEl.addClass('ddc_ink_photo-page__thumbnails-btn');
			setPhotoTraceChevronLabel(button.buttonEl, 'Thumbnails', 'start');
			button.onClick(() => this.finishNavigation('photos'));
		});

		// The centred pair: auto margins on Thumbnails and Convert all split the free
		// space evenly, so the pair sits midway between those two buttons with equal
		// space each side. That is centred between them, which differs from centring
		// on the row because Thumbnails and Convert all are not the same width.
		const canGoPrevious = this.options.canGoPrevious ?? false;
		footerRow.addButton((button) => {
			setPhotoTraceChevronLabel(button.buttonEl, 'Prev image', 'start');
			// The first photo has nothing earlier. The label stays put so Thumbnails
			// remains the only way back to the grid.
			button.setDisabled(!canGoPrevious);
			button.onClick(() => this.finishNavigation('previous'));
		});
		footerRow.addButton((button) => {
			setPhotoTraceChevronLabel(button.buttonEl, 'Next image', 'end');
			// The last photo has nowhere further to go. Its own convert still works.
			button.setDisabled(!this.options.canGoNext);
			button.onClick(() => this.finishNavigation('next'));
		});

		footerRow.addButton((button) => {
			// Convert all is the only convert action, and it takes this photo with the
			// settings on screen before running the rest. That is why Next can be plain
			// navigation: the last photo is still converted here.
			button.setButtonText('Convert all');
			button.buttonEl.addClass('ddc_ink_photo-page__convert-all-btn');
			button.setCta();
			button.onClick(() => this.finishConvertAll());
		});
	}

	/** Icon button that turns the photo 90° and keeps the pins on the same page corners. */
	private addRotateButton(
		rotateRow: HTMLElement,
		icon: string,
		label: string,
		quarterTurnsClockwise: number,
	): void {
		const button = rotateRow.createEl('button', { cls: 'ddc_ink_photo-page__rotate-btn' });
		button.type = 'button';
		// The label is already visible as text, so no aria-label here. Obsidian turns an
		// aria-label into a tooltip, and repeating the visible text as a tooltip is noise.
		setIcon(button, icon);
		button.createSpan({ text: label });
		button.addEventListener('click', () => this.turnPage(quarterTurnsClockwise));
	}

	/**
	 * Asks the worker for the adjusted preview, then fades it in over the plain photo.
	 *
	 * Nothing here blocks the dialog: the plain photo is already on screen when this runs,
	 * so opening the modal and turning the page feel immediate even though the processing
	 * takes a moment.
	 */
	private requestProcessedPreview(): void {
		const generation = this.paintGeneration + 1;
		this.paintGeneration = generation;
		const plainRgba = this.displayImage.data;
		const width = this.imageWidth;
		const height = this.imageHeight;
		const reuseTunedSettings = this.hasWorkerTunedSettings || !!this.options.initialSettings;
		const adjustment = reuseTunedSettings ? { ...this.adjustment } : undefined;
		const inkSensitivity = reuseTunedSettings ? this.inkSensitivity : undefined;
		this.setPreviewBusy(true);

		void this.worker
			.preview({
				rgba: new Uint8ClampedArray(plainRgba),
				width,
				height,
				adjustment,
				inkSensitivity,
				noiseCleanup: this.noiseCleanup,
			})
			.then((result) => {
				if (generation !== this.paintGeneration) return;
				// The worker picks the auto-tuned values on first open, so the sliders must
				// start where the rendered preview actually is.
				if (!reuseTunedSettings) {
					this.adjustment = { ...result.adjustment };
					this.inkSensitivity = result.inkSensitivity;
					this.hasWorkerTunedSettings = true;
				}
				this.showProcessedPreview(result.maskRgba, result.width, result.height, generation);
			})
			.catch(() => {
				// Leave the plain photo showing. Dragging pins still works.
				if (generation === this.paintGeneration) this.setPreviewBusy(false);
			});
	}

	/**
	 * Turns the render spinner on or off.
	 *
	 * A slider drag queues several renders, so the spinner is cleared only by the newest
	 * one finishing: older completions are ignored by the generation check above.
	 */
	private setPreviewBusy(isBusy: boolean): void {
		this.busyEl?.toggleClass('is-visible', isBusy);
	}

	/**
	 * Puts the processed image in the top layer and fades it in.
	 *
	 * The fade is a CSS transition on opacity, so the swap itself is one paint rather than
	 * an animated redraw of a large image.
	 */
	private showProcessedPreview(
		maskRgba: Uint8ClampedArray,
		width: number,
		height: number,
		generation: number,
	): void {
		const processedImage = this.processedImageEl;
		if (!processedImage) {
			this.setPreviewBusy(false);
			return;
		}
		const canvas = canvasFromRgba(maskRgba, width, height);
		canvas.toBlob((blob) => {
			if (!blob || generation !== this.paintGeneration) return;
			const url = URL.createObjectURL(blob);
			if (this.ownedAdjustedUrl) URL.revokeObjectURL(this.ownedAdjustedUrl);
			this.ownedAdjustedUrl = url;
			/*
			 * Keep the spinner up until the decoded image is actually on screen. Setting src
			 * is not the same as having pixels, and on a large photo the decode is the last
			 * visible delay. `once` so the listener cannot outlive this render.
			 */
			processedImage.addEventListener(
				'load',
				() => {
					if (generation !== this.paintGeneration) return;
					// Fade in on the next frame so the browser sees the new source before the
					// opacity change, otherwise the transition can be skipped.
					window.requestAnimationFrame(() => {
						processedImage.addClass('is-visible');
						this.setPreviewBusy(false);
					});
				},
				{ once: true },
			);
			processedImage.src = url;
		}, 'image/jpeg', 0.9);
	}

	/**
	 * Shows the plain photo for a new orientation or while a pin is held.
	 *
	 * `immediate` drops the processed layer instantly, used when the photo itself changed
	 * so the old processed version would be the wrong shape. The `is-fading` class turns off
	 * the transition while it drops, otherwise the stale image would slowly fade out over
	 * the newly turned photo instead of disappearing.
	 */
	private showPlainPreview(immediate: boolean): void {
		this.paintGeneration += 1;
		this.ensurePlainPreview();
		if (this.imageEl && this.ownedPlainUrl) this.imageEl.src = this.ownedPlainUrl;
		if (!immediate) return;
		const processedImage = this.processedImageEl;
		if (!processedImage) return;
		/*
		 * Drop the stale processed photo with no transition, then restore the transition.
		 * Reading offsetHeight flushes the style change, so opacity 0 and transition none are
		 * applied in the same frame. Removing the class on a later frame instead would let
		 * the browser paint the old image at opacity 1 first, and it would then linger over
		 * the newly turned photo.
		 */
		processedImage.addClass('is-instant');
		processedImage.removeClass('is-visible');
		void processedImage.offsetHeight;
		processedImage.removeClass('is-instant');
	}

	/**
	 * Turns the photo another 90°. Pins stay on the paper, and the corner order follows
	 * so the top-left pin is the top-left of the turned page.
	 */
	private turnPage(quarterTurnsClockwise: number): void {
		this.quarterTurnsClockwise += quarterTurnsClockwise;
		const deltaFromDrag = this.quarterTurnsClockwise - this.turnsAtDragStart;
		this.corners = rotatePageCornersQuarterTurns(
			this.cornersAtDragStart,
			this.sizeAtDragStart.width,
			this.sizeAtDragStart.height,
			deltaFromDrag,
		);
		this.displayImage = rotateImageDataQuarterTurns(this.baseImage, this.quarterTurnsClockwise);
		this.imageWidth = this.displayImage.width;
		this.imageHeight = this.displayImage.height;
		// The plain turn is cheap, so show it at once and let the mask follow.
		this.ownedPlainUrl = null;
		this.applyStageSize();
		this.refreshOverlay();
		this.showPlainPreview(true);
		this.requestProcessedPreview();
	}

	/**
	 * Puts the stage into its holding state and returns the function that ends it.
	 *
	 * While a pin or bar is held the plain photo is shown, so the corner being aimed at is
	 * not sitting under the adjusted rendering. The stage is frozen at a single size for
	 * the whole hold: resizing it to the adjusted image's dimensions mid-drag would move
	 * the pins and jump the crop out from under the pointer.
	 */
	private holdPlainPhoto(): () => void {
		if (this.isAdjusting) return () => undefined;
		this.isAdjusting = true;
		// Cancel any pending render and its spinner: the plain photo is what shows now.
		if (this.pendingRepaintFrame) window.cancelAnimationFrame(this.pendingRepaintFrame);
		this.pendingRepaintFrame = 0;
		this.paintGeneration += 1;
		this.setPreviewBusy(false);
		/*
		 * Fade the processed layer out (0.5s, in CSS) so the plain photo eases in under it.
		 * The plain image is already loaded, so this is a repaint, not a reload. The stage
		 * is frozen at one size so the crop cannot reflow mid-drag.
		 */
		this.stageEl?.addClass('is-held');
		this.ensurePlainPreview();
		if (this.imageEl && this.ownedPlainUrl) this.imageEl.src = this.ownedPlainUrl;
		return () => {
			if (!this.isAdjusting) return;
			this.isAdjusting = false;
			// The processed layer is still rendered underneath, so fading it back needs no
			// re-render. The stage keeps `is-fading-back` for one frame so the same short
			// half-second duration applies in this direction too.
			this.stageEl?.addClass('is-fading-back');
			this.stageEl?.removeClass('is-held');
			this.processedImageEl?.addClass('is-visible');
			window.requestAnimationFrame(() => {
				this.stageEl?.removeClass('is-fading-back');
			});
		};
	}

	/** Moves one pin with the pointer. */
	private beginCornerDrag(index: number, pointerId: number): void {
		const release = this.holdPlainPhoto();
		this.trackPointer(pointerId, (point) => {
			this.corners[index] = {
				x: clampCropValue(point.x, 0, this.imageWidth),
				y: clampCropValue(point.y, 0, this.imageHeight),
			};
			this.rememberPinsForRotate();
			this.refreshOverlay();
		}, release);
	}

	/** Slides both ends of one side by the same amount so the side does not stretch or turn. */
	private beginEdgeDrag(edge: CropEdge, pointerId: number, startPoint: PagePoint): void {
		const release = this.holdPlainPhoto();
		const originStart = { ...this.corners[edge.startIndex] };
		const originEnd = { ...this.corners[edge.endIndex] };
		this.trackPointer(pointerId, (point) => {
			const delta = clampSharedCornerDelta(
				originStart,
				originEnd,
				point.x - startPoint.x,
				point.y - startPoint.y,
				this.imageWidth,
				this.imageHeight,
			);
			this.corners[edge.startIndex] = {
				x: originStart.x + delta.dx,
				y: originStart.y + delta.dy,
			};
			this.corners[edge.endIndex] = {
				x: originEnd.x + delta.dx,
				y: originEnd.y + delta.dy,
			};
			this.rememberPinsForRotate();
			this.refreshOverlay();
		}, release);
	}

	/** Puts the nearest pin on the press, then keeps it under the pointer. */
	private beginNearestCornerDrag(pointerId: number, point: PagePoint): void {
		const index = nearestCornerIndex(point, this.corners);
		const release = this.holdPlainPhoto();
		const place = (next: PagePoint) => {
			this.corners[index] = {
				x: clampCropValue(next.x, 0, this.imageWidth),
				y: clampCropValue(next.y, 0, this.imageHeight),
			};
			this.rememberPinsForRotate();
			this.refreshOverlay();
		};
		place(point);
		this.trackPointer(pointerId, place, release);
	}

	/** Follows one pointer until it lifts, then runs the release step once. */
	private trackPointer(
		pointerId: number,
		onMove: (point: PagePoint) => void,
		onRelease: () => void,
	): void {
		let hasReleased = false;
		const release = () => {
			if (hasReleased) return;
			hasReleased = true;
			onRelease();
		};
		const move = (moveEvent: PointerEvent) => {
			if (moveEvent.pointerId !== pointerId) return;
			const point = this.pagePointFromPointer(moveEvent);
			if (!point) return;
			onMove(point);
		};
		const end = (endEvent: PointerEvent) => {
			if (endEvent.pointerId !== pointerId) return;
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', end);
			window.removeEventListener('pointercancel', end);
			release();
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', end);
		window.addEventListener('pointercancel', end);
	}

	/** Photo pixel under the pointer. Null when the stage has no box yet. */
	private pagePointFromPointer(event: PointerEvent): PagePoint | null {
		const stage = this.stageEl;
		if (!stage) return null;
		const rect = stage.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;
		return {
			x: ((event.clientX - rect.left) / rect.width) * this.imageWidth,
			y: ((event.clientY - rect.top) / rect.height) * this.imageHeight,
		};
	}

	/** Converts a screen-pixel grab distance into photo pixels at the current stage size. */
	private screenPixelsInPhoto(screenPixels: number): number {
		const stage = this.stageEl;
		if (!stage) return screenPixels;
		const rect = stage.getBoundingClientRect();
		if (rect.width <= 0) return screenPixels;
		return screenPixels * (this.imageWidth / rect.width);
	}

	/** A drag edits the live quad, so the next turn starts from these pins. */
	private rememberPinsForRotate(): void {
		this.cornersAtDragStart = this.corners.map((point) => ({ ...point })) as [
			PagePoint,
			PagePoint,
			PagePoint,
			PagePoint,
		];
		this.turnsAtDragStart = this.quarterTurnsClockwise;
		this.sizeAtDragStart = { width: this.imageWidth, height: this.imageHeight };
	}

	/** Points the stage at the current photo size. Values are the live bitmap edges. */
	private applyStageSize(): void {
		const stage = this.stageEl;
		if (!stage) return;
		stage.style.aspectRatio = `${this.imageWidth} / ${this.imageHeight}`;
		stage.style.maxWidth = `min(100%, calc(48vh * ${this.imageWidth} / ${Math.max(1, this.imageHeight)}))`;
	}

	/** Redraws the quad, the dimmed outside, and the four pins. */
	private refreshOverlay(): void {
		const overlay = this.overlayEl;
		const polygon = this.polygonEl;
		const outsideMask = this.outsideMaskEl;
		if (!overlay || !polygon || !outsideMask) return;
		overlay.setAttribute('viewBox', `0 0 ${this.imageWidth} ${this.imageHeight}`);
		polygon.setAttribute('stroke-width', String(Math.max(3, this.imageWidth / 180)));
		const points = this.corners.map((point) => `${point.x},${point.y}`).join(' ');
		polygon.setAttribute('points', points);
		const [c0, c1, c2, c3] = this.corners;
		outsideMask.setAttribute(
			'd',
			`M 0 0 H ${this.imageWidth} V ${this.imageHeight} H 0 Z M ${c0.x} ${c0.y} L ${c1.x} ${c1.y} L ${c2.x} ${c2.y} L ${c3.x} ${c3.y} Z`,
		);
		for (let index = 0; index < 4; index++) {
			this.handles[index].style.left = `${(this.corners[index].x / this.imageWidth) * 100}%`;
			this.handles[index].style.top = `${(this.corners[index].y / this.imageHeight) * 100}%`;
		}
	}

	/**
	 * Re-renders the preview after a slider change.
	 *
	 * Coalesced to one request per frame so dragging a slider does not queue a render per
	 * input event, and the current processed image stays on screen until the new one lands.
	 */
	private scheduleAdjustedImage(): void {
		if (this.isAdjusting) return;
		if (this.pendingRepaintFrame) return;
		this.pendingRepaintFrame = window.requestAnimationFrame(() => {
			this.pendingRepaintFrame = 0;
			this.requestProcessedPreview();
		});
	}

	/** Builds the plain-photo preview once, for use while a pin is held. */
	private ensurePlainPreview(): void {
		if (this.ownedPlainUrl) return;
		const canvas = canvasFromRgba(this.displayImage.data, this.displayImage.width, this.displayImage.height);
		// A data URL avoids holding a second object URL that would need revoking, and this
		// runs at most once per turn.
		this.ownedPlainUrl = canvas.toDataURL('image/jpeg', 0.9);
	}

	private finish(choice: WritingPhotoPageChoice): void {
		if (this.settled) return;
		this.settled = true;
		this.close();
		this.onChoice(choice);
	}

	/** Reads the on-screen page and detection state into one settings object. */
	private currentPageSettings(): PhotoPageSettings {
		const corners = this.corners.map((point) => ({ ...point })) as [
			PagePoint,
			PagePoint,
			PagePoint,
			PagePoint,
		];
		return {
			corners,
			quarterTurnsClockwise: normalizeQuarterTurns(this.quarterTurnsClockwise),
			adjustment: { ...this.adjustment },
			inkSensitivity: this.inkSensitivity,
			noiseCleanup: this.noiseCleanup,
		};
	}

	/**
	 * Finishes the batch, starting with this photo on its current settings.
	 *
	 * Every other exit carries the settings too, so a page pinned here is remembered when
	 * the user navigates away and comes back.
	 */
	private finishConvertAll(): void {
		this.finish({ action: 'convert-all', ...this.currentPageSettings() });
	}

	/** Leaves for the grid or another image, keeping what was just set up. */
	private finishNavigation(
		action: 'photos' | 'previous' | 'next',
	): void {
		this.finish({ action, ...this.currentPageSettings() });
	}
}
