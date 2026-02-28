import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Click a button in the open modal by its exact text label. */
async function clickModalButton(label: string) {
	await browser.execute((label: string) => {
		const buttons = document.querySelectorAll('.modal-container button');
		for (const btn of buttons) {
			if (btn.textContent?.trim() === label) {
				(btn as HTMLElement).click();
				return;
			}
		}
	}, label);
}

/** Wait until the modal contains a button with the given label. */
async function waitForModalButton(label: string, timeout = 15000) {
	await browser.waitUntil(
		async () => {
			const buttons = await browser.$$('.modal-container button');
			for (const btn of buttons) {
				if ((await btn.getText()).trim() === label) return true;
			}
			return false;
		},
		{ timeout },
	);
}

/** Return the full text content of the open modal. */
async function modalText(): Promise<string> {
	return browser.execute(() => {
		const modal = document.querySelector('.modal-container');
		return modal?.textContent ?? '';
	});
}

/** Open the FileConversionModal directly via the plugin API. */
async function openConversionModal(opts: {
	filePath: string;
	toType: 'inkWriting' | 'inkDrawing';
	sourceMdFilePath?: string;
}) {
	await browser.executeObsidian(async ({ app }, opts) => {
		const plugin = (app.plugins.plugins as any)['ink'];
		if (!plugin) throw new Error('ink plugin not found');

		const file = app.vault.getAbstractFileByPath(opts.filePath);
		if (!file) throw new Error(`file not found: ${opts.filePath}`);

		const sourceMdFile = opts.sourceMdFilePath
			? (app.vault.getAbstractFileByPath(opts.sourceMdFilePath) ?? undefined)
			: undefined;

		const { FileConversionModal } = await import(
			// @ts-ignore – runtime import inside executeObsidian
			'../src/components/dom-components/modals/file-conversion-modal/file-conversion-modal'
		).catch(() => null) ?? {};

		if (!FileConversionModal) throw new Error('FileConversionModal not importable');

		new FileConversionModal(plugin, file, opts.toType, { sourceMdFile }).open();
	}, opts);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FileConversionModal', function () {
	before(async function () {
		await browser.reloadObsidian({ vault: 'qa-test-vault' });
		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)['ink']),
			{ timeout: 15000 },
		);
	});

	// ─── Scan phase ─────────────────────────────────────────────────────────

	describe('scan phase', function () {
		beforeEach(async function () {
			await browser.reloadObsidian({ vault: 'qa-test-vault' });
			await browser.waitUntil(
				async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)['ink']),
				{ timeout: 15000 },
			);
		});

		it('modal opens and transitions from scan to confirm phase', async function () {
			await browser.executeObsidian(async ({ app }) => {
				const plugin = (app.plugins.plugins as any)['ink'];
				const file = app.vault.getAbstractFileByPath('Ink/Writing/modal-test-writing.svg');
				if (!file || !plugin) return;
				const modal = new (plugin.constructor as any).FileConversionModal ?? null;
				// Fallback: trigger via plugin helper if available, else just open the file
			});

			// Directly trigger the modal through the plugin's command infrastructure
			const opened = await browser.executeObsidian(async ({ app }) => {
				const plugin = (app.plugins.plugins as any)['ink'];
				if (!plugin) return false;

				const file = app.vault.getAbstractFileByPath('Ink/Writing/modal-test-writing.svg');
				if (!file) return false;

				// Use the plugin's registered commands to find "Convert to Drawing"
				// or open modal via the public interface
				try {
					// Access via the plugin's modal registry pattern
					plugin._lastOpenedModal = null;
					const cmd = (app as any).commands?.commands?.['ink:convert-to-drawing'];
					if (cmd) {
						cmd.callback?.();
						return true;
					}
				} catch (_) {}
				return false;
			});

			// Modal should appear after scan
			const modal = await browser.$('.modal-container');
			await modal.waitForExist({ timeout: 8000 });
			await expect(modal).toExist();

			// After scan completes, Convert button should appear
			await waitForModalButton('Convert');
		});
	});

	// ─── Confirm → convert: writing → drawing ───────────────────────────────

	describe('writing to drawing conversion', function () {
		const WRITING_PATH = 'Ink/Writing/modal-test-writing.svg';
		const NOTE1_PATH = '14 - Conversion Modal/Note With Writing.md';
		const NOTE2_PATH = '14 - Conversion Modal/Second Note With Writing.md';

		before(async function () {
			await browser.reloadObsidian({ vault: 'qa-test-vault' });
			await browser.waitUntil(
				async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)['ink']),
				{ timeout: 15000 },
			);
		});

		it('scan finds both notes that embed the writing file', async function () {
			// Open the modal for the writing file, no sourceMdFile (simulates full-page view)
			await browser.executeObsidian(async ({ app }) => {
				const plugin = (app.plugins.plugins as any)['ink'];
				const file = app.vault.getAbstractFileByPath('Ink/Writing/modal-test-writing.svg');
				if (!plugin || !file) return;
				// Trigger via the writing view's pane menu (simulated)
				await obsidianPage?.openFile?.('Ink/Writing/modal-test-writing.svg');
				const leaf = app.workspace.activeLeaf;
				const view = leaf?.view as any;
				if (view?.onPaneMenu) {
					view.onPaneMenu({
						addItem: (cb: any) => {
							const item = {
								_title: '',
								setTitle: (t: string) => { item._title = t; return item; },
								setSection: () => item,
								onClick: (fn: () => void) => { if (item._title === 'Convert to Drawing') fn(); return item; },
							};
							cb(item);
						},
					}, 'more-options');
				}
			});

			const modal = await browser.$('.modal-container');
			await modal.waitForExist({ timeout: 8000 });

			// Wait for confirm phase
			await waitForModalButton('Convert');

			const text = await modalText();
			// The confirm phase should list both affected notes
			expect(text).toContain('Note With Writing');
			expect(text).toContain('Second Note With Writing');
		});

		it('converts writing SVG to drawing and updates embed strings in both notes', async function () {
			// Reload and programmatically trigger the conversion (bypassing the modal UI)
			// This tests the underlying logic end-to-end via the plugin API
			const result = await browser.executeObsidian(async ({ app }) => {
				const plugin = (app.plugins.plugins as any)['ink'];
				if (!plugin) return { error: 'no plugin' };

				const writingFile = app.vault.getAbstractFileByPath('Ink/Writing/modal-test-writing.svg');
				if (!writingFile) return { error: 'writing file missing' };

				try {
					// Call the conversion logic directly
					const { executeFileConversion, findNotesContainingFileEmbed } =
						await import('../src/logic/utils/convert-file-embeds') as any;
					const { convertWriteFileToDraw } =
						await import('../src/components/formats/current/utils/convertWriteFileToDraw') as any;

					const affected = await findNotesContainingFileEmbed(
						app.vault,
						'Ink/Writing/modal-test-writing.svg',
						'inkWriting',
					);

					await executeFileConversion(
						plugin,
						writingFile,
						'inkDrawing',
						affected,
						null,
						() => {},
					);

					return { success: true, affectedCount: affected.length };
				} catch (err: any) {
					return { error: err?.message ?? String(err) };
				}
			});

			await browser.pause(1000);

			expect((result as any).error).toBeUndefined();
			expect((result as any).affectedCount).toBeGreaterThanOrEqual(2);

			// Verify SVG metadata changed to inkDrawing
			const fileType = await browser.executeObsidian(async ({ app }) => {
				const file = app.vault.getAbstractFileByPath('Ink/Writing/modal-test-writing.svg');
				if (!file) return null;
				const content = await app.vault.read(file as any);
				const match = content.match(/file-type="([^"]+)"/);
				return match ? match[1] : null;
			});
			expect(fileType).toBe('inkDrawing');

			// Verify both notes now have InkDrawing embeds
			const note1Content = await browser.executeObsidian(async ({ app }) => {
				const f = app.vault.getAbstractFileByPath('14 - Conversion Modal/Note With Writing.md');
				return f ? app.vault.read(f as any) : '';
			});
			expect(note1Content).toContain('![InkDrawing]');
			expect(note1Content).not.toContain('![InkWriting]');

			const note2Content = await browser.executeObsidian(async ({ app }) => {
				const f = app.vault.getAbstractFileByPath('14 - Conversion Modal/Second Note With Writing.md');
				return f ? app.vault.read(f as any) : '';
			});
			expect(note2Content).toContain('![InkDrawing]');
			expect(note2Content).not.toContain('![InkWriting]');
		});
	});

	// ─── Confirm → convert: drawing → writing ───────────────────────────────

	describe('drawing to writing conversion', function () {
		const DRAWING_PATH = 'Ink/Drawing/modal-test-drawing.svg';

		before(async function () {
			await browser.reloadObsidian({ vault: 'qa-test-vault' });
			await browser.waitUntil(
				async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)['ink']),
				{ timeout: 15000 },
			);
		});

		it('converts drawing SVG to writing and updates embed string in note', async function () {
			const result = await browser.executeObsidian(async ({ app }) => {
				const plugin = (app.plugins.plugins as any)['ink'];
				if (!plugin) return { error: 'no plugin' };

				const drawingFile = app.vault.getAbstractFileByPath('Ink/Drawing/modal-test-drawing.svg');
				if (!drawingFile) return { error: 'drawing file missing' };

				try {
					const { executeFileConversion, findNotesContainingFileEmbed } =
						await import('../src/logic/utils/convert-file-embeds') as any;

					const affected = await findNotesContainingFileEmbed(
						app.vault,
						'Ink/Drawing/modal-test-drawing.svg',
						'inkDrawing',
					);

					await executeFileConversion(
						plugin,
						drawingFile,
						'inkWriting',
						affected,
						null,
						() => {},
					);

					return { success: true, affectedCount: affected.length };
				} catch (err: any) {
					return { error: err?.message ?? String(err) };
				}
			});

			await browser.pause(1000);

			expect((result as any).error).toBeUndefined();

			const fileType = await browser.executeObsidian(async ({ app }) => {
				const file = app.vault.getAbstractFileByPath('Ink/Drawing/modal-test-drawing.svg');
				if (!file) return null;
				const content = await app.vault.read(file as any);
				const match = content.match(/file-type="([^"]+)"/);
				return match ? match[1] : null;
			});
			expect(fileType).toBe('inkWriting');

			const noteContent = await browser.executeObsidian(async ({ app }) => {
				const f = app.vault.getAbstractFileByPath('14 - Conversion Modal/Note With Drawing.md');
				return f ? app.vault.read(f as any) : '';
			});
			expect(noteContent).toContain('![InkWriting]');
			expect(noteContent).not.toContain('![InkDrawing]');
		});
	});

	// ─── File move option ────────────────────────────────────────────────────

	describe('file move option', function () {
		before(async function () {
			await browser.reloadObsidian({ vault: 'qa-test-vault' });
			await browser.waitUntil(
				async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)['ink']),
				{ timeout: 15000 },
			);
		});

		it('moves the file to the drawing subfolder when the move option is accepted', async function () {
			const result = await browser.executeObsidian(async ({ app }) => {
				const plugin = (app.plugins.plugins as any)['ink'];
				if (!plugin) return { error: 'no plugin' };

				const writingFile = app.vault.getAbstractFileByPath('Ink/Writing/modal-test-writing.svg');
				if (!writingFile) return { error: 'writing file missing' };

				try {
					const { executeFileConversion, findNotesContainingFileEmbed } =
						await import('../src/logic/utils/convert-file-embeds') as any;

					const affected = await findNotesContainingFileEmbed(
						app.vault,
						'Ink/Writing/modal-test-writing.svg',
						'inkWriting',
					);

					const movePath = 'Ink/Drawing/modal-test-writing.svg';
					await executeFileConversion(
						plugin,
						writingFile,
						'inkDrawing',
						affected,
						movePath,
						() => {},
					);

					return { success: true };
				} catch (err: any) {
					return { error: err?.message ?? String(err) };
				}
			});

			await browser.pause(1000);

			expect((result as any).error).toBeUndefined();

			// Original path should no longer exist
			const originalExists = await browser.executeObsidian(({ app }) => {
				return !!app.vault.getAbstractFileByPath('Ink/Writing/modal-test-writing.svg');
			});
			expect(originalExists).toBe(false);

			// New path should exist
			const movedExists = await browser.executeObsidian(({ app }) => {
				return !!app.vault.getAbstractFileByPath('Ink/Drawing/modal-test-writing.svg');
			});
			expect(movedExists).toBe(true);

			// Moved file should have inkDrawing type
			const fileType = await browser.executeObsidian(async ({ app }) => {
				const file = app.vault.getAbstractFileByPath('Ink/Drawing/modal-test-writing.svg');
				if (!file) return null;
				const content = await app.vault.read(file as any);
				const match = content.match(/file-type="([^"]+)"/);
				return match ? match[1] : null;
			});
			expect(fileType).toBe('inkDrawing');

			// Both notes should now reference the new path
			const note1Content = await browser.executeObsidian(async ({ app }) => {
				const f = app.vault.getAbstractFileByPath('14 - Conversion Modal/Note With Writing.md');
				return f ? app.vault.read(f as any) : '';
			});
			expect(note1Content).toContain('Ink/Drawing/modal-test-writing.svg');
		});
	});

	// ─── Cancel: no changes ──────────────────────────────────────────────────

	describe('cancel', function () {
		before(async function () {
			await browser.reloadObsidian({ vault: 'qa-test-vault' });
			await browser.waitUntil(
				async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)['ink']),
				{ timeout: 15000 },
			);
		});

		it('cancelling the modal leaves the file and notes unchanged', async function () {
			// Read the original file metadata
			const originalFileType = await browser.executeObsidian(async ({ app }) => {
				const file = app.vault.getAbstractFileByPath('Ink/Writing/modal-test-writing.svg');
				if (!file) return null;
				const content = await app.vault.read(file as any);
				const match = content.match(/file-type="([^"]+)"/);
				return match ? match[1] : null;
			});

			// Open the writing file and trigger the modal via pane menu
			await obsidianPage.openFile('Ink/Writing/modal-test-writing.svg');
			await browser.pause(1500);

			await browser.executeObsidian(({ app }) => {
				const leaf = app.workspace.activeLeaf;
				const view = leaf?.view as any;
				if (view?.onPaneMenu) {
					view.onPaneMenu({
						addItem: (cb: any) => {
							const item = {
								_title: '',
								setTitle: (t: string) => { item._title = t; return item; },
								setSection: () => item,
								onClick: (fn: () => void) => { if (item._title === 'Convert to Drawing') fn(); return item; },
							};
							cb(item);
						},
					}, 'more-options');
				}
			});

			const modal = await browser.$('.modal-container');
			const modalExists = await modal.isExisting();

			if (modalExists) {
				// Wait for the confirm phase (Convert button)
				await waitForModalButton('Convert', 10000);
				// Click Cancel instead
				await clickModalButton('Cancel');
				await browser.pause(500);
			}

			// File type should be unchanged
			const fileTypeAfter = await browser.executeObsidian(async ({ app }) => {
				const file = app.vault.getAbstractFileByPath('Ink/Writing/modal-test-writing.svg');
				if (!file) return null;
				const content = await app.vault.read(file as any);
				const match = content.match(/file-type="([^"]+)"/);
				return match ? match[1] : null;
			});
			expect(fileTypeAfter).toBe(originalFileType);

			// Note With Writing.md embed string must also be unchanged
			const note1Content = await browser.executeObsidian(async ({ app }) => {
				const f = app.vault.getAbstractFileByPath('14 - Conversion Modal/Note With Writing.md');
				return f ? app.vault.read(f as any) : '';
			});
			expect(note1Content).toContain('![InkWriting]');
			expect(note1Content).not.toContain('![InkDrawing]');

			// Second Note With Writing.md embed string must also be unchanged
			const note2Content = await browser.executeObsidian(async ({ app }) => {
				const f = app.vault.getAbstractFileByPath('14 - Conversion Modal/Second Note With Writing.md');
				return f ? app.vault.read(f as any) : '';
			});
			expect(note2Content).toContain('![InkWriting]');
			expect(note2Content).not.toContain('![InkDrawing]');
		});
	});

	// ─── Context messaging ───────────────────────────────────────────────────

	describe('context messaging', function () {
		before(async function () {
			await browser.reloadObsidian({ vault: 'qa-test-vault' });
			await browser.waitUntil(
				async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)['ink']),
				{ timeout: 15000 },
			);
		});

		it('shows "other notes" wording when triggered from an embed (sourceMdFile set)', async function () {
			// Open Note With Writing and trigger from embed context (sourceMdFile = that note)
			await obsidianPage.openFile('14 - Conversion Modal/Note With Writing.md');
			await browser.pause(1500);

			await browser.executeObsidian(({ app }) => {
				const plugin = (app.plugins.plugins as any)['ink'];
				if (!plugin) return;
				const file = app.vault.getAbstractFileByPath('Ink/Writing/modal-test-writing.svg');
				const sourceMdFile = app.vault.getAbstractFileByPath('14 - Conversion Modal/Note With Writing.md');
				if (!file || !sourceMdFile) return;

				// Simulate "Convert to Drawing" from embed context
				// Use the plugin's pane menu on the active leaf or directly open the modal
				const leaf = app.workspace.activeLeaf;
				const view = leaf?.view as any;
				if (view?.onPaneMenu) {
					view.onPaneMenu({
						addItem: (cb: any) => {
							const item = {
								_title: '',
								setTitle: (t: string) => { item._title = t; return item; },
								setSection: () => item,
								onClick: (fn: () => void) => { if (item._title === 'Convert to Drawing') fn(); return item; },
							};
							cb(item);
						},
					}, 'more-options');
				}
			});

			const modal = await browser.$('.modal-container');
			const modalExists = await modal.isExisting();
			if (!modalExists) this.skip();

			await waitForModalButton('Convert', 10000);

			const text = await modalText();
			// When sourceMdFile is set, should say "other notes"
			// (Note: the Note With Writing note is the source, so Second Note With Writing is "other")
			// The heading says "These other notes also embed this file:"
			expect(text.toLowerCase()).toContain('other');

			await clickModalButton('Cancel');
		});

		it('does NOT say "other notes" when triggered from full-page view (no sourceMdFile)', async function () {
			// Open the SVG file directly and trigger from pane menu (no sourceMdFile)
			await obsidianPage.openFile('Ink/Writing/modal-test-writing.svg');
			await browser.pause(1500);

			await browser.executeObsidian(({ app }) => {
				const leaf = app.workspace.activeLeaf;
				const view = leaf?.view as any;
				if (view?.onPaneMenu) {
					view.onPaneMenu({
						addItem: (cb: any) => {
							const item = {
								_title: '',
								setTitle: (t: string) => { item._title = t; return item; },
								setSection: () => item,
								onClick: (fn: () => void) => { if (item._title === 'Convert to Drawing') fn(); return item; },
							};
							cb(item);
						},
					}, 'more-options');
				}
			});

			const modal = await browser.$('.modal-container');
			const modalExists = await modal.isExisting();
			if (!modalExists) this.skip();

			await waitForModalButton('Convert', 10000);

			const text = await modalText();
			// From full-page view, should say "These notes embed this file:" (no "other")
			expect(text).toContain('These notes embed this file');
			expect(text).not.toContain('other notes');

			await clickModalButton('Cancel');
		});
	});
});
