import { beforeEach, describe, expect, test } from '@jest/globals';
import { openTranscriptionBatchModal } from 'src/components/dom-components/modals/transcription-batch-modal/transcription-batch-modal';

/**
 * The shared Obsidian mock swallows elements. This modal's copy and disabled state
 * are the product, so the test gives Modal a real document.
 */
jest.mock('obsidian', () => {
	const documentRef = (globalThis as { document: Document }).document;

	function augment(element: HTMLElement): HTMLElement {
		const host = element as any;
		host.createDiv = (className?: string) => {
			const child = augment(documentRef.createElement('div'));
			if (className) child.className = className;
			element.appendChild(child);
			return child;
		};
		host.createEl = (tag: string, options?: { cls?: string; text?: string; type?: string }) => {
			const child = augment(documentRef.createElement(tag));
			if (options?.cls) child.className = options.cls;
			if (options?.text) child.textContent = options.text;
			if (options?.type && child.tagName === 'BUTTON') {
				(child as { type?: string }).type = options.type;
			}
			element.appendChild(child);
			return child;
		};
		host.setText = (text: string) => {
			element.textContent = text;
		};
		host.empty = () => {
			element.replaceChildren();
		};
		host.addClass = (className: string) => {
			element.classList.add(className);
		};
		return element;
	}

	class Modal {
		app: unknown;
		titleEl: HTMLElement;
		contentEl: HTMLElement;
		modalEl: HTMLElement;
		constructor(app: unknown) {
			this.app = app;
			this.modalEl = augment(documentRef.createElement('div'));
			this.titleEl = augment(documentRef.createElement('div'));
			this.contentEl = augment(documentRef.createElement('div'));
			this.modalEl.append(this.titleEl, this.contentEl);
			documentRef.body.append(this.modalEl);
		}
		open(): void {
			(this as unknown as { onOpen: () => void }).onOpen();
		}
		close(): void {
			(this as unknown as { onClose: () => void }).onClose();
			this.modalEl.remove();
		}
		onOpen(): void {}
		onClose(): void {}
	}
	return { Modal };
});

const plugin = { app: {} } as any;

function button(label: string): HTMLButtonElement {
	const match = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
	if (!(match instanceof HTMLButtonElement)) throw new Error(`missing button ${label}`);
	return match;
}

describe('transcription batch modal', () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	test('offers missing-only and re-transcribe, and cancel confirms nothing', () => {
		const scopes: string[] = [];
		openTranscriptionBatchModal({
			plugin,
			fileType: 'inkWriting',
			pendingCount: 2,
			alreadyTranscribedCount: 1,
			onConfirm: (scope) => scopes.push(scope),
		});

		expect(document.body.textContent).toContain('Transcribe Writing');
		expect(document.body.textContent).not.toContain('Each file uses AI credits');
		expect(document.body.textContent).toContain('2 writing have no transcript yet. 1 already has one.');
		expect(button('Untranscribed Only').disabled).toBe(false);
		expect(button('Untranscribed Only').classList.contains('mod-cta')).toBe(true);
		expect(button('Re-transcribe All').classList.contains('mod-cta')).toBe(true);
		expect([...document.querySelectorAll('button')].map((candidate) => candidate.textContent)).toEqual([
			'Cancel',
			'Untranscribed Only',
			'Re-transcribe All',
		]);

		button('Untranscribed Only').click();
		expect(scopes).toEqual(['missing-only']);
		expect(document.body.textContent).not.toContain('Transcribe Writing');
	});

	test('disables missing-only when every file already has a transcript', () => {
		const scopes: string[] = [];
		openTranscriptionBatchModal({
			plugin,
			fileType: 'inkDrawing',
			pendingCount: 0,
			alreadyTranscribedCount: 1,
			onConfirm: (scope) => scopes.push(scope),
		});

		expect(document.body.textContent).toContain('Transcribe Drawing');
		expect(document.body.textContent).not.toContain('Each file uses AI credits');
		expect(document.body.textContent).toContain('0 drawings have no transcript yet. 1 already has one.');
		expect(button('Untranscribed Only').disabled).toBe(true);

		button('Re-transcribe All').click();
		expect(scopes).toEqual(['everything']);
	});

	test('cancel closes without a scope', () => {
		const scopes: string[] = [];
		openTranscriptionBatchModal({
			plugin,
			fileType: 'inkWriting',
			pendingCount: 1,
			alreadyTranscribedCount: 0,
			onConfirm: (scope) => scopes.push(scope),
		});
		button('Cancel').click();
		expect(scopes).toEqual([]);
		expect(document.body.querySelector('.ddc_ink_transcription-batch-modal')).toBeNull();
	});
});
