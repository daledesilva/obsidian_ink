import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ReactSortable } from 'react-sortablejs';
import { Notice, setIcon, Setting, Modal } from 'obsidian';
import InkPlugin from 'src/main';
import { PhotoTargetToggle } from 'src/components/dom-components/photo-target-toggle/photo-target-toggle';
import {
	addPhotosToBatch,
	applyPhotoBatchOrder,
	countPendingPhotos,
	photoBatchPreviewUrl,
	removePhotoFromBatch,
	setAllPhotoBatchTargets,
	setPhotoBatchTarget,
	type NormalizedPageQuad,
	type PhotoBatch,
	type PhotoBatchItem,
} from 'src/logic/photo-trace/photo-batch-session';
import type { InkPhotoConvertTarget } from 'src/logic/photo-trace/photo-convert-target';
import { preparePhotoBatchThumbnails } from 'src/logic/photo-trace/photo-batch-thumbnail-prep';
import { setPhotoTraceChevronLabel } from 'src/components/dom-components/modals/photo-trace-chevron-button';
import { leavePhotoTraceModal } from 'src/components/dom-components/modals/photo-trace-modal-leave';
import './writing-photo-batch-modal.scss';

////////
////////

export type WritingPhotoBatchChoice =
	/** Refine images opens the adjust walk. The button used to be labelled Next. */
	| { action: 'next' }
	| { action: 'convert-all' }
	/** Jump straight to one photo's edit screen, chosen from its pencil button. */
	| { action: 'edit'; itemId: string }
	| { action: 'cancel' };

export interface WritingPhotoBatchModalOptions {
	plugin: InkPlugin;
	batch: PhotoBatch;
	/**
	 * Decodes the photo Refine or a pencil is about to open, while this grid is still up.
	 * Called when the grid opens and whenever the queue changes, so that click is usually instant.
	 */
	warmUpcomingPhoto?: () => void;
	/**
	 * Runs before the grid closes. Return a promise when the next photo is still decoding
	 * so the clicked button spins and the grid stays up until the adjust dialog can open.
	 */
	beforeLeave?: (choice: WritingPhotoBatchChoice) => void | Promise<void>;
	onChoice: (choice: WritingPhotoBatchChoice) => void;
}

/**
 * Collects photos before any tracing happens. Choosing, taking, and pasting all
 * append to the same ordered list, so the user can build a batch from mixed
 * sources before deciding the order and what each photo becomes.
 */
export function openWritingPhotoBatchModal(options: WritingPhotoBatchModalOptions): void {
	const modal = new WritingPhotoBatchModal(options);
	modal.open();
}

////////
////////

interface PhotoBatchGridProps {
	batch: PhotoBatch;
	onReorder: (orderedItemIds: string[]) => void;
	onTargetChange: (itemId: string, target: InkPhotoConvertTarget) => void;
	onRemove: (itemId: string) => void;
	/** Opens the edit screen for one photo straight from its pencil button. */
	onEdit: (itemId: string, buttonEl: HTMLElement) => void;
}

/**
 * The thumbnail grid. SortableJS owns the drag, which is the same reordering
 * framework the Project Browser settings tab uses for its lists.
 */
const PhotoBatchGrid: React.FC<PhotoBatchGridProps> = (props) => {
	// A copy per render. The batch array is mutated in place, so handing React the same
	// array reference makes every card keep its old props after a toggle or a drag.
	const items = [...props.batch.items];

	return (
		<ReactSortable
			list={items}
			setList={(nextItems) => props.onReorder(nextItems.map((item) => item.id))}
			animation={200}
			handle='.ddc_ink_writing-photo-batch-thumb-frame'
			ghostClass='ddc_ink_writing-photo-batch-card--ghost'
			chosenClass='ddc_ink_writing-photo-batch-card--chosen'
			draggable='.ddc_ink_writing-photo-batch-card'
			className='ddc_ink_writing-photo-batch-grid'
		>
			{items.map((item, index) => (
				<PhotoBatchCard
					key={item.id}
					item={item}
					index={index}
					previewUrl={photoBatchPreviewUrl(props.batch, item)}
					onTargetChange={props.onTargetChange}
					onRemove={props.onRemove}
					onEdit={props.onEdit}
				/>
			))}
		</ReactSortable>
	);
};

interface PhotoBatchCardProps {
	item: PhotoBatchItem;
	index: number;
	/** What to show: the edited preview once there is one, otherwise the raw file. */
	previewUrl: string;
	/** Injected by react-sortablejs so a drag can be mapped back to the right photo. */
	'data-id'?: string;
	onTargetChange: (itemId: string, target: InkPhotoConvertTarget) => void;
	onRemove: (itemId: string) => void;
	onEdit: (itemId: string, buttonEl: HTMLElement) => void;
}

interface PhotoCardIconButtonProps {
	className: string;
	/** Accessible name, rendered as visually hidden text rather than a tooltip. */
	label: string;
	iconName: string;
	onClick: (buttonEl: HTMLElement) => void;
}

/**
 * A small icon button for a thumbnail corner.
 *
 * The name lives in visually hidden text instead of `aria-label`. Obsidian shows its own
 * tooltip for any element carrying an aria-label, and on a photo card that tooltip covers
 * the very thumbnail the user is aiming at.
 */
const PhotoCardIconButton: React.FC<PhotoCardIconButtonProps> = (props) => {
	const iconElRef = React.useRef<HTMLSpanElement>(null);

	React.useLayoutEffect(() => {
		if (iconElRef.current) setIcon(iconElRef.current, props.iconName);
	}, [props.iconName]);

	return (
		<button
			type='button'
			className={`${props.className} clickable-icon`}
			onClick={(event) => {
				const buttonEl = event.currentTarget;
				if (!(buttonEl instanceof HTMLElement)) return;
				props.onClick(buttonEl);
			}}
		>
			<span
				ref={iconElRef}
				className='ddc_ink_writing-photo-batch-icon'
				data-resting-icon={props.iconName}
				aria-hidden='true'
			/>
			<span className='ddc_ink_visually-hidden'>{props.label}</span>
		</button>
	);
};

/**
 * One photo card: the thumbnail with the page outline drawn on it, a trash button top
 * left, a pencil top right, and its destination toggle flush along the bottom edge.
 */
const PhotoBatchCard: React.FC<PhotoBatchCardProps> = (props) => {
	const isConverted = !!props.item.convertedTarget;
	const photoLabel = `Photo ${props.index + 1}`;

	const aspectRatio = props.item.thumbnailAspectRatio;
	// The frame takes the photo's own shape once it is known. Before that the placeholder
	// ratio holds the layout so cards do not jump when the ratio arrives.
	const thumbFrameStyle: React.CSSProperties = aspectRatio
		? { aspectRatio: `${aspectRatio}` }
		: {};

	return (
		// react-sortablejs clones this element to attach data-id. A component that does not
		// forward it leaves SortableJS unable to name the item, so the drop order is lost.
		<li className='ddc_ink_writing-photo-batch-card' data-id={props['data-id']}>
			<div
				className='ddc_ink_writing-photo-batch-thumb-frame'
				style={thumbFrameStyle}
				// The thumbnail is SortableJS's handle, so pressing a button still clicks it.
			>
				{/*
				 * The image and its page outline share this box. The box is the photo's own
				 * shape, so the overlay sits exactly on the pixels; putting the overlay on
				 * the frame instead offset it whenever the frame letterboxed the photo.
				 */}
				<div
					className='ddc_ink_writing-photo-batch-thumb-box'
					style={thumbFrameStyle}
				>
					<img
						className='ddc_ink_writing-photo-batch-thumb'
						src={props.previewUrl}
						alt={photoLabel}
						draggable={false}
					/>
					<PhotoThumbnailPageCorners corners={props.item.thumbnailCorners} />
				</div>
				{isConverted && (
					<div className='ddc_ink_writing-photo-batch-converted'>Converted</div>
				)}
				{/* A converted photo is already in the note, so it cannot be dropped here. */}
				{!isConverted && (
					<PhotoCardIconButton
						className='ddc_ink_writing-photo-batch-remove'
						label={`Remove ${photoLabel.toLowerCase()}`}
						iconName='trash-2'
						onClick={() => props.onRemove(props.item.id)}
					/>
				)}
				<PhotoCardIconButton
					className='ddc_ink_writing-photo-batch-edit'
					label={`Edit ${photoLabel.toLowerCase()}`}
					iconName='pencil'
					onClick={(buttonEl) => props.onEdit(props.item.id, buttonEl)}
				/>
			</div>
			<div className='ddc_ink_writing-photo-batch-target'>
				<PhotoTargetToggle
					target={props.item.convertedTarget ?? props.item.target}
					label={`${photoLabel} converts to`}
					isDisabled={isConverted}
					onChange={(target) => props.onTargetChange(props.item.id, target)}
				/>
			</div>
		</li>
	);
};

interface PhotoThumbnailPageCornersProps {
	corners: NormalizedPageQuad | null;
}

/**
 * The page outline drawn over a thumbnail: everything outside the page is dimmed and
 * the page edge is stroked.
 *
 * There are no corner pins. This is a preview, not a control, and the pencil opens the
 * screen where the corners can actually be moved.
 */
const PhotoThumbnailPageCorners: React.FC<PhotoThumbnailPageCornersProps> = (props) => {
	const corners = props.corners;
	if (!corners) return null;

	// Percent coordinates so the overlay follows whatever size the card is drawn at.
	const points = corners.map((point) => `${point.x * 100},${point.y * 100}`).join(' ');

	return (
		<svg
			className='ddc_ink_writing-photo-batch-corners'
			viewBox='0 0 100 100'
			preserveAspectRatio='none'
			aria-hidden='true'
		>
			{/* Even-odd path dims everything outside the page. */}
			<path
				className='ddc_ink_writing-photo-batch-corners__outside-mask'
				d={`M 0 0 H 100 V 100 H 0 Z M ${corners
					.map((point) => `${point.x * 100} ${point.y * 100}`)
					.join(' L ')} Z`}
				fillRule='evenodd'
			/>
			<polygon className='ddc_ink_writing-photo-batch-corners__polygon' points={points} />
		</svg>
	);
};

////////
////////

class WritingPhotoBatchModal extends Modal {
	private readonly options: WritingPhotoBatchModalOptions;
	/** Files chosen from one dialog land together, so their selection order is kept. */
	private fileInputEl: HTMLInputElement | null = null;
	/** The three source cards, collapsed to headings once a photo exists. */
	private sourceGridEl: HTMLElement | null = null;
	/** Count, assign actions, and the rule under them: hidden while the batch is empty. */
	private summaryEl: HTMLElement | null = null;
	private summaryRuleEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;
	private refineButtonEl: HTMLButtonElement | null = null;
	private convertAllButtonEl: HTMLButtonElement | null = null;
	/** Hidden while the batch is empty. The title-bar close is the way out until then. */
	private footerEl: HTMLElement | null = null;
	/** Hidden until a photo exists, because there is nothing to assign or convert yet. */
	private assignWritingButtonEl: HTMLButtonElement | null = null;
	private assignDrawingButtonEl: HTMLButtonElement | null = null;
	private gridRoot: Root | null = null;
	private settled = false;
	/** True from a Refine, pencil, or Convert all click until the grid closes. */
	private isLeaving = false;
	private onPaste = (event: ClipboardEvent) => {
		const files = imageFilesFromClipboardEvent(event);
		if (files.length === 0) return;
		event.preventDefault();
		this.addFiles(files);
	};

	constructor(options: WritingPhotoBatchModalOptions) {
		super(options.plugin.app);
		this.options = options;
	}

	onOpen(): void {
		const { titleEl, contentEl, modalEl } = this;
		// Hook for ink-button-hover.scss so plain dialog buttons hover on macOS.
		modalEl.addClass('ddc_ink_modal');
		modalEl.addClass('ddc_ink_writing-photo-batch-modal');
		titleEl.setText('Create ink from photos');

		const inputEl = contentEl.createEl('input', {
			attr: {
				type: 'file',
				accept: 'image/*',
				class: 'ddc_ink_writing-photo-batch-input',
			},
		});
		// Several photos at once is the point of this step, and the dialog stays
		// open afterwards so a batch can mix a camera shot with gallery picks.
		inputEl.multiple = true;
		this.fileInputEl = inputEl;

		// Count first, then the bulk assign actions, then a rule. All of it only appears
		// once there is a photo to describe or act on.
		const summaryEl = contentEl.createDiv({ cls: 'ddc_ink_writing-photo-batch-summary' });
		this.summaryEl = summaryEl;
		this.countEl = summaryEl.createDiv({ cls: 'ddc_ink_writing-photo-batch-count' });
		const assignActionsEl = summaryEl.createDiv({ cls: 'ddc_ink_writing-photo-batch-assign' });
		const assignWritingEl = assignActionsEl.createEl('button', {
			text: 'Assign all as writing',
			type: 'button',
		});
		assignWritingEl.addEventListener('click', () => this.assignAllTargets('writing'));
		this.assignWritingButtonEl = assignWritingEl;
		const assignDrawingEl = assignActionsEl.createEl('button', {
			text: 'Assign all as drawing',
			type: 'button',
		});
		assignDrawingEl.addEventListener('click', () => this.assignAllTargets('drawing'));
		this.assignDrawingButtonEl = assignDrawingEl;

		// Rule under the assign row. Hidden with the summary while the batch is empty.
		const summaryRuleEl = contentEl.createDiv({ cls: 'ddc_ink_writing-photo-batch-rule' });
		this.summaryRuleEl = summaryRuleEl;

		const gridHostEl = contentEl.createDiv({ cls: 'ddc_ink_writing-photo-batch-grid-host' });
		this.gridRoot = createRoot(gridHostEl);
		this.renderGrid();

		// The photo source cards sit under the thumbnails, so the batch is readable first
		// and adding more is the follow-up action. Each card hugs its own text.
		const sourceGridEl = contentEl.createDiv({ cls: 'ddc_ink_photo-source-grid' });
		this.sourceGridEl = sourceGridEl;
		this.addSourceCard(sourceGridEl, {
			title: 'Take photo',
			description: 'Use the camera to capture a page now.',
			onClick: () => this.openFileInput(true),
		});
		this.addSourceCard(sourceGridEl, {
			title: 'Choose photo',
			description: 'Pick one or more images already on this device.',
			onClick: () => this.openFileInput(false),
		});
		this.addSourceCard(sourceGridEl, {
			title: 'Paste photo',
			description: 'Add an image copied to the clipboard.',
			onClick: () => {
				void this.pasteFromClipboard();
			},
		});

		inputEl.addEventListener('change', () => {
			const files = Array.from(inputEl.files ?? []);
			// Clear first so picking the same photo twice still fires a change event.
			inputEl.value = '';
			if (files.length === 0) return;
			this.addFiles(files);
		});

		// A paste while this dialog is open is more reliable than clipboard.read()
		// in Electron, which often needs an extra permission prompt.
		window.addEventListener('paste', this.onPaste);

		// No rule div here: Obsidian's own .setting-item styling already draws the divider
		// above the footer. Adding one as well produced two lines stacked a few pixels apart.
		// The title-bar close already leaves this grid, so the row is only the batch actions.
		const footer = new Setting(contentEl);
		footer.settingEl.addClass('ddc_ink_writing-photo-batch-footer');
		this.footerEl = footer.settingEl;
		footer
			.addButton((button) => {
				// Same walk Next used to start. The chevron matches Next image.
				button.buttonEl.addClass('ddc_ink_writing-photo-batch-footer__refine');
				setPhotoTraceChevronLabel(button.buttonEl, 'Refine images', 'end');
				this.refineButtonEl = button.buttonEl;
				button.onClick(() => this.requestLeave(button.buttonEl, { action: 'next' }));
			})
			.addButton((button) => {
				button.setButtonText('Convert all');
				button.setCta();
				button.buttonEl.addClass('ddc_ink_writing-photo-batch-footer__convert');
				this.convertAllButtonEl = button.buttonEl;
				button.onClick(() => this.requestLeave(button.buttonEl, { action: 'convert-all' }));
			});

		this.refreshFooter();
		// The photo Refine opens can decode while the user is still looking at the grid.
		this.options.warmUpcomingPhoto?.();
		// Obsidian focuses the first visible control after onOpen. That is Take photo,
		// which makes one equal choice look selected. Focus the dialog instead so a
		// keyboard user is still inside it, and Tab still reaches the buttons.
		preventInitialButtonFocus(this);
	}

	onClose(): void {
		window.removeEventListener('paste', this.onPaste);
		this.gridRoot?.unmount();
		this.gridRoot = null;
		this.contentEl.empty();
		if (!this.settled) this.options.onChoice({ action: 'cancel' });
		this.settled = true;
	}

	/** Adds one large clickable source card: title, description, and a whole-card click. */
	private addSourceCard(
		gridEl: HTMLElement,
		card: { title: string; description: string; onClick: () => void },
	): void {
		const cardEl = gridEl.createDiv({ cls: 'ddc_ink_photo-source-card' });
		// A div with button semantics, matching how the migration modal builds its cards,
		// so Obsidian's button styling does not fight the card layout.
		cardEl.setAttribute('role', 'button');
		cardEl.setAttribute('tabindex', '0');
		cardEl.createDiv({ cls: 'ddc_ink_photo-source-card__title', text: card.title });
		cardEl.createDiv({ cls: 'ddc_ink_photo-source-card__desc', text: card.description });
		cardEl.addEventListener('click', card.onClick);
		cardEl.addEventListener('keydown', (event) => {
			const isActivationKey = event.key === 'Enter' || event.key === ' ';
			if (!isActivationKey) return;
			event.preventDefault();
			card.onClick();
		});
	}

	/** Points the hidden input at the camera or at the gallery, then opens it. */
	private openFileInput(useCamera: boolean): void {
		const inputEl = this.fileInputEl;
		if (!inputEl) return;
		if (useCamera) {
			inputEl.setAttr('capture', 'environment');
			// Some mobile browsers ignore `capture` when `multiple` is set, and the camera
			// only ever returns one shot anyway, so a second can be taken after.
			inputEl.multiple = false;
		} else {
			inputEl.removeAttribute('capture');
			inputEl.multiple = true;
		}
		inputEl.click();
	}

	private async pasteFromClipboard(): Promise<void> {
		const files = await imageFilesFromClipboardApi();
		if (files.length > 0) {
			this.addFiles(files);
			return;
		}
		new Notice('Copy a photo first, then paste it here with Cmd+V or Ctrl+V.');
	}

	private addFiles(files: File[]): void {
		addPhotosToBatch(this.options.batch, files);
		this.renderGrid();
		this.options.warmUpcomingPhoto?.();
		void this.prepareNewThumbnails();
	}

	/**
	 * Fills in the page pins for photos that do not have them yet.
	 *
	 * Decoding every photo here is what lets the grid show the corner overlay straight
	 * after a pick, instead of only after that photo has been opened. It runs in the
	 * background, one photo at a time, so the dialog stays responsive.
	 */
	private async prepareNewThumbnails(): Promise<void> {
		await preparePhotoBatchThumbnails({
			plugin: this.options.plugin,
			batch: this.options.batch,
			onThumbnailReady: () => {
				// The dialog can close mid-decode; the grid root is gone by then.
				if (!this.gridRoot) return;
				this.renderGrid();
			},
		});
	}

	private assignAllTargets(target: InkPhotoConvertTarget): void {
		setAllPhotoBatchTargets(this.options.batch, target);
		this.renderGrid();
	}

	private handleReorder(orderedItemIds: string[]): void {
		const didReorder = applyPhotoBatchOrder(this.options.batch, orderedItemIds);
		// SortableJS also reports the current order on mount, which is not a change.
		if (!didReorder) return;
		this.renderGrid();
		this.options.warmUpcomingPhoto?.();
	}

	private handleTargetChange(itemId: string, target: InkPhotoConvertTarget): void {
		setPhotoBatchTarget(this.options.batch, itemId, target);
		// The toggle's pressed state is derived from the item, so the grid must re-render
		// for the change to show. React 18 renders asynchronously, so this is a repaint.
		this.renderGrid();
	}

	private handleRemove(itemId: string): void {
		removePhotoFromBatch(this.options.batch, itemId);
		this.renderGrid();
		this.options.warmUpcomingPhoto?.();
	}

	/** The pencil opens that photo's adjust screen once its bitmap is ready. */
	private handleEdit(itemId: string, buttonEl: HTMLElement): void {
		this.requestLeave(buttonEl, { action: 'edit', itemId });
	}

	/** Re-renders the grid from the mutated batch and updates the footer. */
	private renderGrid(): void {
		const gridRoot = this.gridRoot;
		if (!gridRoot) return;
		gridRoot.render(
			<PhotoBatchGrid
				batch={this.options.batch}
				onReorder={(orderedItemIds) => this.handleReorder(orderedItemIds)}
				onTargetChange={(itemId, target) => this.handleTargetChange(itemId, target)}
				onRemove={(itemId) => this.handleRemove(itemId)}
				onEdit={(itemId, buttonEl) => this.handleEdit(itemId, buttonEl)}
			/>,
		);
		this.refreshFooter();
	}

	/**
	 * Keeps the source cards, the count row, and the footer in step with the batch.
	 *
	 * Once a photo exists the three large source cards collapse to just their headings:
	 * the batch is under way, so the whole card's description has done its job and the
	 * thumbnails deserve the space.
	 */
	private refreshFooter(): void {
		const items = this.options.batch.items;
		const hasPhotos = items.length > 0;
		const pendingCount = countPendingPhotos(this.options.batch);
		this.sourceGridEl?.toggleClass('is-collapsed', hasPhotos);
		// The whole summary block and its rule belong to a populated batch.
		this.summaryEl?.toggleClass('is-hidden', !hasPhotos);
		this.summaryRuleEl?.toggleClass('is-hidden', !hasPhotos);
		if (this.countEl) {
			// The count only earns its line once there is something to count.
			this.countEl.toggleClass('is-hidden', !hasPhotos);
			const convertedCount = items.length - pendingCount;
			const photoLabel = items.length === 1 ? 'photo' : 'photos';
			let countText = `${items.length} ${photoLabel}`;
			if (convertedCount > 0) countText += `, ${convertedCount} already converted`;
			// Order matters here, so the hint sits beside the count as a secondary line.
			this.countEl.setText(hasPhotos ? `${countText} · drag to reorder` : '');
		}
		// Nothing in the footer is useful before a photo exists, and the title-bar close
		// is already the way out, so the whole row hides with the summary.
		this.footerEl?.toggleClass('is-hidden', !hasPhotos);
		const hiddenWhileEmptyEls = [
			this.assignWritingButtonEl,
			this.assignDrawingButtonEl,
			this.convertAllButtonEl,
			this.refineButtonEl,
		];
		for (const buttonEl of hiddenWhileEmptyEls) {
			if (!buttonEl) continue;
			buttonEl.toggleClass('is-hidden', !hasPhotos);
		}
		if (this.convertAllButtonEl) this.convertAllButtonEl.disabled = pendingCount === 0;
	}

	private finish(choice: WritingPhotoBatchChoice): void {
		if (this.settled) return;
		this.settled = true;
		this.close();
		this.options.onChoice(choice);
	}

	/**
	 * Prepares the next screen before closing, so the note never shows between dialogs.
	 * A second click is ignored until this one finishes or the grid closes.
	 */
	private requestLeave(buttonEl: HTMLElement, choice: WritingPhotoBatchChoice): void {
		if (this.settled || this.isLeaving) return;
		this.isLeaving = true;
		void leavePhotoTraceModal(
			buttonEl,
			() => this.options.beforeLeave?.(choice),
			() => !this.settled,
			() => this.finish(choice),
		).finally(() => {
			if (!this.settled) this.isLeaving = false;
		});
	}
}

/**
 * Stops Obsidian highlighting the first button, and moves focus onto the dialog.
 * hasInitialInputFocus is real on Modal in Obsidian 1.14 but missing from the typings.
 */
function preventInitialButtonFocus(modal: Modal): void {
	const dialog = modal as Modal & { hasInitialInputFocus?: boolean };
	dialog.hasInitialInputFocus = false;
	if (!modal.titleEl.id) modal.titleEl.id = 'ddc_ink_writing-photo-batch-title';
	modal.modalEl.setAttribute('role', 'dialog');
	modal.modalEl.setAttribute('aria-modal', 'true');
	modal.modalEl.setAttribute('aria-labelledby', modal.titleEl.id);
	modal.modalEl.tabIndex = -1;
	// The dialog is not a control. A focus ring around the whole box is noise,
	// which the batch modal's own stylesheet removes.
	modal.modalEl.focus({ preventScroll: true });
}

async function imageFilesFromClipboardApi(): Promise<File[]> {
	if (!navigator.clipboard?.read) return [];
	try {
		const items = await navigator.clipboard.read();
		const files: File[] = [];
		for (const item of items) {
			const imageType = item.types.find((type) => type.startsWith('image/'));
			if (!imageType) continue;
			const blob = await item.getType(imageType);
			files.push(clipboardImageFile(blob));
		}
		return files;
	} catch {
		// Permission denied or no image. The paste listener still works.
		return [];
	}
}

function imageFilesFromClipboardEvent(event: ClipboardEvent): File[] {
	const data = event.clipboardData;
	if (!data) return [];
	const clipboardFiles: File[] = [];
	for (const file of Array.from(data.files)) {
		if (file.type.startsWith('image/')) clipboardFiles.push(file);
	}
	if (clipboardFiles.length > 0) return clipboardFiles;
	for (const item of Array.from(data.items)) {
		if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
		const blob = item.getAsFile();
		if (blob) clipboardFiles.push(clipboardImageFile(blob));
	}
	return clipboardFiles;
}

function clipboardImageFile(blob: Blob): File {
	if (blob instanceof File && blob.name) return blob;
	const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
	return new File([blob], `handwriting-clipboard.${extension}`, {
		type: blob.type || 'image/jpeg',
	});
}
