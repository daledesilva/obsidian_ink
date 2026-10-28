import { Modal, setIcon, Setting } from 'obsidian';
import InkPlugin from 'src/main';
import type { PagePoint } from 'src/logic/photo-trace/find-page-quad';
import {
	rotateImageDataQuarterTurns,
	rotatePageCornersQuarterTurns,
} from 'src/logic/photo-trace/rotate-image-data';
import { canvasFromRgba, canvasJpegObjectUrl } from 'src/logic/photo-trace/run-photo-trace';
import './writing-photo-crop-modal.scss';

////////
////////

export interface WritingPhotoCropResult {
	corners: [PagePoint, PagePoint, PagePoint, PagePoint];
	/** Clockwise 90° steps from the photo as picked. 0–3. */
	quarterTurnsClockwise: number;
}

/**
 * Lets the user turn the photo and drag the page corners before it is traced.
 * Resolves null when the import is cancelled.
 */
export function openWritingPhotoCropModal(
	plugin: InkPlugin,
	sourceImage: ImageData,
	defaultCorners: [PagePoint, PagePoint, PagePoint, PagePoint],
	quarterTurnsClockwise = 0,
): Promise<WritingPhotoCropResult | null> {
	return new Promise((resolve) => {
		const modal = new WritingPhotoCropModal(plugin, {
			sourceImage,
			defaultCorners,
			quarterTurnsClockwise,
			onConfirm: (result) => resolve(result),
			onCancel: () => resolve(null),
		});
		modal.open();
	});
}

class WritingPhotoCropModal extends Modal {
	private baseImage: ImageData;
	private cornersAtOpen: [PagePoint, PagePoint, PagePoint, PagePoint];
	private turnsAtOpen: number;
	private sizeAtOpen: { width: number; height: number };
	private displayImage: ImageData;
	private imageWidth: number;
	private imageHeight: number;
	private corners: [PagePoint, PagePoint, PagePoint, PagePoint];
	private quarterTurnsClockwise: number;
	private onConfirm: (result: WritingPhotoCropResult) => void;
	private onCancel: () => void;
	private settled = false;
	private imageEl: HTMLImageElement | null = null;
	private stageEl: HTMLDivElement | null = null;
	private overlayEl: SVGSVGElement | null = null;
	private outsideMaskEl: SVGPathElement | null = null;
	private polygonEl: SVGPolygonElement | null = null;
	private handles: HTMLDivElement[] = [];
	private ownedPreviewUrl: string | null = null;
	private previewGeneration = 0;

	constructor(plugin: InkPlugin, options: {
		sourceImage: ImageData;
		defaultCorners: [PagePoint, PagePoint, PagePoint, PagePoint];
		quarterTurnsClockwise: number;
		onConfirm: (result: WritingPhotoCropResult) => void;
		onCancel: () => void;
	}) {
		super(plugin.app);
		this.baseImage = options.sourceImage;
		this.turnsAtOpen = options.quarterTurnsClockwise;
		this.quarterTurnsClockwise = options.quarterTurnsClockwise;
		this.displayImage = rotateImageDataQuarterTurns(options.sourceImage, options.quarterTurnsClockwise);
		this.imageWidth = this.displayImage.width;
		this.imageHeight = this.displayImage.height;
		this.sizeAtOpen = { width: this.imageWidth, height: this.imageHeight };
		this.cornersAtOpen = options.defaultCorners.map((point) => ({ ...point })) as [
			PagePoint,
			PagePoint,
			PagePoint,
			PagePoint,
		];
		this.corners = this.cornersAtOpen.map((point) => ({ ...point })) as [
			PagePoint,
			PagePoint,
			PagePoint,
			PagePoint,
		];
		this.onConfirm = options.onConfirm;
		this.onCancel = options.onCancel;
	}

	onOpen(): void {
		const { titleEl, contentEl, modalEl } = this;
		// The dialog stays inside the window and can be resized. The stage scales down
		// responsively inside the modal so the instructions and buttons always fit.
		modalEl.addClass('ddc_ink_photo-crop-modal');
		titleEl.setText('Define the corners of the page');
		contentEl.createEl('p', {
			text: 'Drag these circles onto the corners of the page',
			cls: 'ddc_ink_photo-crop__intro',
		});

		const frame = contentEl.createDiv({ cls: 'ddc_ink_photo-crop__frame' });
		const stage = frame.createDiv({ cls: 'ddc_ink_photo-crop__stage' });
		this.stageEl = stage;
		this.applyStageSize();

		const image = stage.createEl('img', { cls: 'ddc_ink_photo-crop__image' });
		image.draggable = false;
		this.imageEl = image;

		const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		overlay.setAttribute('class', 'ddc_ink_photo-crop__overlay');
		this.overlayEl = overlay;
		// Even-odd path dims the photo outside the selected quad with the theme background at 50% opacity.
		const outsideMask = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		outsideMask.setAttribute('class', 'ddc_ink_photo-crop__outside-mask');
		outsideMask.setAttribute('fill', 'var(--background-primary)');
		outsideMask.setAttribute('fill-opacity', '0.5');
		outsideMask.setAttribute('fill-rule', 'evenodd');
		this.outsideMaskEl = outsideMask;
		overlay.appendChild(outsideMask);
		const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
		polygon.setAttribute('fill', 'none');
		polygon.setAttribute('stroke', 'white');
		this.polygonEl = polygon;
		overlay.appendChild(polygon);
		stage.appendChild(overlay);

		this.handles = [];
		for (let index = 0; index < 4; index++) {
			const handle = stage.createDiv({ cls: 'ddc_ink_photo-crop__handle' });
			this.handles.push(handle);
			handle.addEventListener('pointerdown', (event) => {
				event.preventDefault();
				event.stopPropagation();
				const pointerId = event.pointerId;
				const move = (moveEvent: PointerEvent) => {
					if (moveEvent.pointerId !== pointerId) return;
					const rect = stage.getBoundingClientRect();
					const x = ((moveEvent.clientX - rect.left) / rect.width) * this.imageWidth;
					const y = ((moveEvent.clientY - rect.top) / rect.height) * this.imageHeight;
					this.corners[index] = {
						x: clamp(x, 0, this.imageWidth),
						y: clamp(y, 0, this.imageHeight),
					};
					// A drag edits the live quad, so the next turn starts from these pins.
					this.cornersAtOpen = this.corners.map((point) => ({ ...point })) as [
						PagePoint,
						PagePoint,
						PagePoint,
						PagePoint,
					];
					this.turnsAtOpen = this.quarterTurnsClockwise;
					this.sizeAtOpen = { width: this.imageWidth, height: this.imageHeight };
					this.refreshOverlay();
				};
				const up = (upEvent: PointerEvent) => {
					if (upEvent.pointerId !== pointerId) return;
					window.removeEventListener('pointermove', move);
					window.removeEventListener('pointerup', up);
				};
				window.addEventListener('pointermove', move);
				window.addEventListener('pointerup', up);
			});
		}

		const rotateRow = contentEl.createDiv({ cls: 'ddc_ink_photo-crop__rotate' });
		this.addRotateButton(rotateRow, 'rotate-ccw', 'Rotate left', -1);
		this.addRotateButton(rotateRow, 'rotate-cw', 'Rotate right', 1);

		this.refreshOverlay();
		void this.showDisplayImage();

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText('Cancel');
				button.onClick(() => this.finish(null));
			})
			.addButton((button) => {
				button.setButtonText('Use this page');
				button.setCta();
				button.onClick(() => {
					const corners = this.corners.map((point) => ({ ...point })) as [
						PagePoint,
						PagePoint,
						PagePoint,
						PagePoint,
					];
					this.finish({
						corners,
						quarterTurnsClockwise: normalizeQuarterTurns(this.quarterTurnsClockwise),
					});
				});
			});
	}

	onClose(): void {
		this.previewGeneration += 1;
		if (this.ownedPreviewUrl) URL.revokeObjectURL(this.ownedPreviewUrl);
		this.ownedPreviewUrl = null;
		this.contentEl.empty();
		if (!this.settled) this.onCancel();
		this.settled = true;
	}

	/** Icon button that turns the photo 90° and keeps the pins on the same page corners. */
	private addRotateButton(
		rotateRow: HTMLElement,
		icon: string,
		label: string,
		quarterTurnsClockwise: number,
	): void {
		const button = rotateRow.createEl('button', { cls: 'ddc_ink_photo-crop__rotate-btn' });
		button.type = 'button';
		button.setAttribute('aria-label', label);
		setIcon(button, icon);
		button.createSpan({ text: label });
		button.addEventListener('click', () => this.turnPage(quarterTurnsClockwise));
	}

	/**
	 * Turns the photo another 90°. Pins stay on the paper, and the corner order
	 * follows so the top-left pin is the top-left of the turned page.
	 */
	private turnPage(quarterTurnsClockwise: number): void {
		this.quarterTurnsClockwise += quarterTurnsClockwise;
		const deltaFromOpen = this.quarterTurnsClockwise - this.turnsAtOpen;
		this.corners = rotatePageCornersQuarterTurns(
			this.cornersAtOpen,
			this.sizeAtOpen.width,
			this.sizeAtOpen.height,
			deltaFromOpen,
		);
		this.displayImage = rotateImageDataQuarterTurns(this.baseImage, this.quarterTurnsClockwise);
		this.imageWidth = this.displayImage.width;
		this.imageHeight = this.displayImage.height;
		this.applyStageSize();
		this.refreshOverlay();
		void this.showDisplayImage();
	}

	/** Points the stage at the current photo size. Values are the live bitmap edges. */
	private applyStageSize(): void {
		const stage = this.stageEl;
		if (!stage) return;
		stage.style.aspectRatio = `${this.imageWidth} / ${this.imageHeight}`;
		stage.style.maxWidth = `min(100%, calc(56vh * ${this.imageWidth} / ${Math.max(1, this.imageHeight)}))`;
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

	/** Replaces the preview URL after a turn. Older URLs are revoked. */
	private async showDisplayImage(): Promise<void> {
		const generation = this.previewGeneration + 1;
		this.previewGeneration = generation;
		const canvas = canvasFromRgba(this.displayImage.data, this.displayImage.width, this.displayImage.height);
		const url = await canvasJpegObjectUrl(canvas);
		if (generation !== this.previewGeneration) {
			URL.revokeObjectURL(url);
			return;
		}
		if (this.ownedPreviewUrl) URL.revokeObjectURL(this.ownedPreviewUrl);
		this.ownedPreviewUrl = url;
		if (this.imageEl) this.imageEl.src = url;
	}

	private finish(result: WritingPhotoCropResult | null): void {
		if (this.settled) return;
		this.settled = true;
		this.close();
		if (result) {
			this.onConfirm(result);
			return;
		}
		this.onCancel();
	}
}

/** Maps any integer quarter-turn count onto 0–3 clockwise steps. */
function normalizeQuarterTurns(quarterTurnsClockwise: number): number {
	const turns = quarterTurnsClockwise % 4;
	if (turns < 0) return turns + 4;
	return turns;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Largest stage that keeps the photo's aspect ratio inside the dialog.
 * reservedHeight leaves room for the title, the instruction, the controls, and padding.
 */
export function fitWritingPhotoStage(
	imageWidth: number,
	imageHeight: number,
	viewportWidth: number,
	viewportHeight: number,
	reservedHeight = 280,
): { width: number; height: number } {
	const maxWidth = Math.max(160, Math.min(520, viewportWidth - 120));
	const maxHeight = Math.max(160, viewportHeight - reservedHeight);
	const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
	return {
		width: Math.max(1, Math.round(imageWidth * scale)),
		height: Math.max(1, Math.round(imageHeight * scale)),
	};
}
