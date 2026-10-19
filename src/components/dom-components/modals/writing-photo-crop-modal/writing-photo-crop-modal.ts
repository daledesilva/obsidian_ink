import { Modal, Setting } from 'obsidian';
import InkPlugin from 'src/main';
import type { PagePoint } from 'src/logic/photo-trace/find-page-quad';
import './writing-photo-crop-modal.scss';

////////
////////

/**
 * Lets the user drag the page corners before a photo is traced.
 * Resolves null when the import is cancelled.
 */
export function openWritingPhotoCropModal(
	plugin: InkPlugin,
	imageUrl: string,
	imageWidth: number,
	imageHeight: number,
	defaultCorners: [PagePoint, PagePoint, PagePoint, PagePoint],
): Promise<[PagePoint, PagePoint, PagePoint, PagePoint] | null> {
	return new Promise((resolve) => {
		const modal = new WritingPhotoCropModal(plugin, {
			imageUrl,
			imageWidth,
			imageHeight,
			defaultCorners,
			onConfirm: (corners) => resolve(corners),
			onCancel: () => resolve(null),
		});
		modal.open();
	});
}

class WritingPhotoCropModal extends Modal {
	private imageUrl: string;
	private imageWidth: number;
	private imageHeight: number;
	private corners: [PagePoint, PagePoint, PagePoint, PagePoint];
	private onConfirm: (corners: [PagePoint, PagePoint, PagePoint, PagePoint]) => void;
	private onCancel: () => void;
	private settled = false;

	constructor(plugin: InkPlugin, options: {
		imageUrl: string;
		imageWidth: number;
		imageHeight: number;
		defaultCorners: [PagePoint, PagePoint, PagePoint, PagePoint];
		onConfirm: (corners: [PagePoint, PagePoint, PagePoint, PagePoint]) => void;
		onCancel: () => void;
	}) {
		super(plugin.app);
		this.imageUrl = options.imageUrl;
		this.imageWidth = options.imageWidth;
		this.imageHeight = options.imageHeight;
		this.corners = options.defaultCorners.map((point) => ({ ...point })) as [
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
		// The dialog stays inside the window. The photo scales down inside it
		// so the instructions and buttons stay visible beside a tall shot.
		modalEl.addClass('ddc_ink_photo-crop-modal');
		titleEl.setText('Fit the page');
		contentEl.createEl('p', {
			text: 'Drag the corners onto the page. Writing outside this shape is ignored. Leave the corners at the edges if the photo is already cropped to the page.',
			cls: 'ddc_ink_photo-crop__intro',
		});

		const fitted = fitWritingPhotoStage(this.imageWidth, this.imageHeight, window.innerWidth, window.innerHeight);
		const frame = contentEl.createDiv({ cls: 'ddc_ink_photo-crop__frame' });
		const stage = frame.createDiv({ cls: 'ddc_ink_photo-crop__stage' });
		stage.style.width = `${fitted.width}px`;
		stage.style.height = `${fitted.height}px`;

		const image = stage.createEl('img', { cls: 'ddc_ink_photo-crop__image' });
		image.src = this.imageUrl;
		image.draggable = false;

		const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		overlay.setAttribute('class', 'ddc_ink_photo-crop__overlay');
		overlay.setAttribute('viewBox', `0 0 ${this.imageWidth} ${this.imageHeight}`);
		const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
		polygon.setAttribute('fill', 'none');
		polygon.setAttribute('stroke', 'white');
		polygon.setAttribute('stroke-width', String(Math.max(3, this.imageWidth / 180)));
		overlay.appendChild(polygon);
		stage.appendChild(overlay);

		const handles: HTMLDivElement[] = [];
		for (let index = 0; index < 4; index++) {
			const handle = stage.createDiv({ cls: 'ddc_ink_photo-crop__handle' });
			handles.push(handle);
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
					refresh();
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

		const refresh = () => {
			const points = this.corners.map((point) => `${point.x},${point.y}`).join(' ');
			polygon.setAttribute('points', points);
			for (let index = 0; index < 4; index++) {
				handles[index].style.left = `${(this.corners[index].x / this.imageWidth) * 100}%`;
				handles[index].style.top = `${(this.corners[index].y / this.imageHeight) * 100}%`;
			}
		};
		refresh();

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
					this.finish(corners);
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) this.onCancel();
		this.settled = true;
	}

	private finish(corners: [PagePoint, PagePoint, PagePoint, PagePoint] | null): void {
		if (this.settled) return;
		this.settled = true;
		this.close();
		if (corners) {
			this.onConfirm(corners);
			return;
		}
		this.onCancel();
	}
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
