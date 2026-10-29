import { Modal, Notice, Setting } from 'obsidian';
import InkPlugin from 'src/main';

////////
////////

export type WritingPhotoPickerMode = 'camera' | 'library' | 'clipboard';

export class WritingPhotoPickerModal extends Modal {
	private onPick: (file: File) => void;
	private onPaste = (event: ClipboardEvent) => {
		const file = imageFileFromClipboardEvent(event);
		if (!file) return;
		event.preventDefault();
		this.finishWithFile(file);
	};

	constructor(plugin: InkPlugin, onPick: (file: File) => void) {
		super(plugin.app);
		this.onPick = onPick;
	}

	onOpen(): void {
		// Hook for ink-button-hover.scss so plain dialog buttons hover on macOS.
		this.modalEl.addClass('ddc_ink_modal');
		const { titleEl, contentEl } = this;
		titleEl.setText('Create Ink from Photo');
		contentEl.createEl('p', {
			text: 'Ink will trace the image into an editable format.',
		});

		const inputEl = contentEl.createEl('input', {
			attr: {
				type: 'file',
				accept: 'image/*',
				class: 'ddc_ink_writing-photo-picker-input',
			},
		});
		inputEl.style.display = 'none';

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText('Take photo');
				button.onClick(() => {
					inputEl.setAttr('capture', 'environment');
					inputEl.click();
				});
			})
			.addButton((button) => {
				button.setButtonText('Choose photo');
				button.onClick(() => {
					inputEl.removeAttribute('capture');
					inputEl.click();
				});
			})
			.addButton((button) => {
				button.setButtonText('Paste photo');
				button.onClick(() => {
					void this.pasteFromClipboard();
				});
			});

		inputEl.addEventListener('change', () => {
			const file = inputEl.files?.[0];
			if (!file) return;
			this.finishWithFile(file);
			inputEl.value = '';
		});

		// A paste while this dialog is open is more reliable than clipboard.read()
		// in Electron, which often needs an extra permission prompt.
		window.addEventListener('paste', this.onPaste);

		// Obsidian focuses the first visible control after onOpen. That is Take photo,
		// which makes one equal choice look selected. Focus the dialog instead so a
		// keyboard user is still inside it, and Tab still reaches the buttons.
		preventInitialButtonFocus(this);
	}

	onClose(): void {
		window.removeEventListener('paste', this.onPaste);
		this.contentEl.empty();
	}

	private async pasteFromClipboard(): Promise<void> {
		const file = await imageFileFromClipboardApi();
		if (file) {
			this.finishWithFile(file);
			return;
		}
		new Notice('Copy a photo first, then paste it here with Cmd+V or Ctrl+V.');
	}

	private finishWithFile(file: File): void {
		this.close();
		this.onPick(file);
	}
}

/**
 * Stops Obsidian highlighting the first button, and moves focus onto the dialog.
 * hasInitialInputFocus is real on Modal in Obsidian 1.14 but missing from the typings.
 */
function preventInitialButtonFocus(modal: Modal): void {
	const dialog = modal as Modal & { hasInitialInputFocus?: boolean };
	dialog.hasInitialInputFocus = false;
	if (!modal.titleEl.id) modal.titleEl.id = 'ddc_ink_writing-photo-picker-title';
	modal.modalEl.setAttribute('role', 'dialog');
	modal.modalEl.setAttribute('aria-modal', 'true');
	modal.modalEl.setAttribute('aria-labelledby', modal.titleEl.id);
	modal.modalEl.tabIndex = -1;
	// The dialog is not a control. A focus ring around the whole box is noise.
	modal.modalEl.style.outline = 'none';
	modal.modalEl.focus({ preventScroll: true });
}

async function imageFileFromClipboardApi(): Promise<File | null> {
	if (!navigator.clipboard?.read) return null;
	try {
		const items = await navigator.clipboard.read();
		for (const item of items) {
			const imageType = item.types.find((type) => type.startsWith('image/'));
			if (!imageType) continue;
			const blob = await item.getType(imageType);
			return clipboardImageFile(blob);
		}
	} catch {
		// Permission denied or no image. The paste listener still works.
	}
	return null;
}

function imageFileFromClipboardEvent(event: ClipboardEvent): File | null {
	const data = event.clipboardData;
	if (!data) return null;
	for (const file of Array.from(data.files)) {
		if (file.type.startsWith('image/')) return file;
	}
	for (const item of Array.from(data.items)) {
		if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
		const blob = item.getAsFile();
		if (blob) return clipboardImageFile(blob);
	}
	return null;
}

function clipboardImageFile(blob: Blob): File {
	if (blob instanceof File && blob.name) return blob;
	const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
	return new File([blob], `handwriting-clipboard.${extension}`, {
		type: blob.type || 'image/jpeg',
	});
}
