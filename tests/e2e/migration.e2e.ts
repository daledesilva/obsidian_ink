import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

async function waitForMigrationConfirmPhase(timeout = 10000) {
	await browser.waitUntil(
		async () => {
			const text = await browser.execute(() => {
				const modal = document.querySelector(".modal-container");
				return modal?.textContent ?? '';
			});
			// Confirm title is sentence case ("legacy ink"); empty-state copy still uses "legacy Ink".
			const normalized = text.toLowerCase();
			return normalized.includes('legacy ink') || normalized.includes('newest svg format');
		},
		{ timeout },
	);
}

async function clickMigratePermanentlyCard() {
	await browser.execute(() => {
		const cards = document.querySelectorAll(".modal-container .ddc_ink_migration-choice-card");
		for (const card of cards) {
			if (card.textContent?.includes('Migrate Permanently')) {
				(card as HTMLElement).click();
				return;
			}
		}
	});
}

describe("Legacy Embed Migration", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }) => !!app.plugins.plugins["ink"]),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
	});

	it("legacy writing embed renders before migration", async function () {
		await obsidianPage.openFile("13 - Migration Test/Legacy Writing Note.md");
		const embed = await browser.$(".ddc_ink_writing-embed-preview");
		await embed.waitForExist({ timeout: 10000 });
		await expect(embed).toExist();
	});

	it("legacy drawing embed renders before migration", async function () {
		await obsidianPage.openFile("13 - Migration Test/Legacy Drawing Note.md");
		const embed = await browser.$(".ddc_ink_drawing-embed-preview");
		await embed.waitForExist({ timeout: 10000 });
		await expect(embed).toExist();
	});

	it("migration command opens the migration modal", async function () {
		await browser.executeObsidian(({ app }) => {
			(app.plugins.plugins["ink"] as { openMigrationModal: () => void }).openMigrationModal();
		});
		await browser.pause(500);
		const modal = await browser.$(".modal-container");
		await modal.waitForExist({ timeout: 5000 });
		await expect(modal).toExist();
	});

	it("modal scans and shows legacy files found", async function () {
		await waitForMigrationConfirmPhase();

		const modalText = await browser.execute(() => {
			const modal = document.querySelector(".modal-container");
			return modal ? modal.textContent : '';
		});
		expect(modalText).toContain('legacy ink');
	});

	it("migration executes successfully and converts legacy files", async function () {
		await waitForMigrationConfirmPhase(8000);
		await clickMigratePermanentlyCard();

		// Wait for migration to complete (Done button appears)
		await browser.waitUntil(
			async () => {
				const buttons = await browser.$$(".modal-container button");
				for (const btn of buttons) {
					const text = await btn.getText();
					if (text.trim() === 'Done') return true;
				}
				return false;
			},
			{ timeout: 15000 }
		);

		// Close the modal
		await browser.execute(() => {
			const buttons = document.querySelectorAll(".modal-container button");
			for (const btn of buttons) {
				if (btn.textContent?.trim() === 'Done') {
					(btn as HTMLElement).click();
					break;
				}
			}
		});

		await browser.pause(500);

		// Verify legacy .writing file is gone
		const writingFileGone = await browser.executeObsidian(({ app }) => {
			const legacyFile = app.vault.getAbstractFileByPath("Ink/Writing/migration-test-2.writing");
			return legacyFile === null;
		});
		expect(writingFileGone).toBe(true);

		// Verify new .svg file exists
		const svgExists = await browser.executeObsidian(({ app }) => {
			const svgFile = app.vault.getAbstractFileByPath("Ink/Writing/migration-test-2.svg");
			return svgFile !== null;
		});
		expect(svgExists).toBe(true);
	});

	it("migrated writing SVG uses ink-canvas metadata", async function () {
		const svgContent = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath("Ink/Writing/migration-test-2.svg");
			if (!file) return null;
			return app.vault.read(file as any);
		});
		expect(svgContent).not.toBeNull();
		expect(svgContent as string).toContain('<ink-canvas version="0.5.0">');
		expect(svgContent as string).not.toContain('<tldraw version=');
	});

	it("legacy writing note now uses current format embed after migration", async function () {
		await obsidianPage.openFile("13 - Migration Test/Legacy Writing Note.md");
		await browser.pause(1000);

		const noteContent = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath("13 - Migration Test/Legacy Writing Note.md");
			if (!file) return '';
			return app.vault.read(file as any);
		});

		// Legacy code block should be gone
		expect(noteContent).not.toContain('```handwritten-ink');
		// Current format embed should be present
		expect(noteContent).toContain('![InkWriting]');
	});

	it("legacy drawing note now uses current format embed after migration", async function () {
		const noteContent = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath("13 - Migration Test/Legacy Drawing Note.md");
			if (!file) return '';
			return app.vault.read(file as any);
		});

		expect(noteContent).not.toContain('```handdrawn-ink');
		expect(noteContent).toContain('![InkDrawing]');
	});

	it("migrated writing embed renders in the note", async function () {
		await obsidianPage.openFile("13 - Migration Test/Legacy Writing Note.md");
		await browser.pause(1000);
		// The note may reopen in reading mode (previously visited). Check for:
		// - Edit mode: ink widget (.ddc_ink_widget-root / .ddc_ink_embed-block)
		// - Reading mode: standard markdown image rendered from ![InkWriting](<path>)
		const embedSelector = ".ddc_ink_embed-block, .ddc_ink_widget-root, img[alt='InkWriting'], .internal-embed[alt='InkWriting']";
		const embed = await browser.$(embedSelector);
		await embed.waitForExist({ timeout: 10000 });
		await expect(embed).toExist();
	});

	it("migrated drawing embed renders in the note", async function () {
		await obsidianPage.openFile("13 - Migration Test/Legacy Drawing Note.md");
		await browser.pause(1000);
		const embedSelector = ".ddc_ink_embed-block, .ddc_ink_widget-root, img[alt='InkDrawing'], .internal-embed[alt='InkDrawing']";
		const embed = await browser.$(embedSelector);
		await embed.waitForExist({ timeout: 10000 });
		await expect(embed).toExist();
	});

	it("mixed format note: only legacy embed is updated, current format embed unchanged", async function () {
		const noteContent = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath("13 - Migration Test/Mixed Formats Note.md");
			if (!file) return '';
			return app.vault.read(file as any);
		});

		// No legacy code blocks remain
		expect(noteContent).not.toContain('```handwritten-ink');
		// Still has a v2 embed (the one that was already current format)
		expect(noteContent).toContain('![InkWriting]');
	});

	it("running migration again finds nothing to migrate (idempotent)", async function () {
		await browser.executeObsidian(({ app }) => {
			(app.plugins.plugins["ink"] as { openMigrationModal: () => void }).openMigrationModal();
		});
		await browser.pause(500);

		// Wait for modal
		await browser.waitUntil(
			async () => {
				const modal = await browser.$(".modal-container");
				return modal.isExisting();
			},
			{ timeout: 5000 }
		);

		// Should show "Nothing to migrate" or a Done button directly
		const modalText = await browser.execute(() => {
			const modal = document.querySelector(".modal-container");
			return modal ? modal.textContent : '';
		});

		expect(
			modalText?.includes('Nothing to migrate') ||
			modalText?.includes('nothing') ||
			modalText?.includes('0 legacy')
		).toBe(true);

		// Close modal
		await browser.execute(() => {
			const btn = document.querySelector(".modal-container button");
			if (btn instanceof HTMLElement) btn.click();
		});
	});
});

// ─── Cancel and multi-note tests (each needs a fresh vault) ──────────────────

describe("Migration: cancel", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }) => !!app.plugins.plugins["ink"]),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
	});

	it("cancelling at the confirm phase leaves all files and notes unchanged", async function () {
		// Capture original state
		const originalLegacyExists = await browser.executeObsidian(({ app }) => {
			return !!app.vault.getAbstractFileByPath("Ink/Writing/migration-test-2.writing");
		});
		expect(originalLegacyExists).toBe(true);

		const originalNoteContent = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath("13 - Migration Test/Legacy Writing Note.md");
			if (!file) return '';
			return app.vault.read(file as any);
		});
		expect(originalNoteContent).toContain('```handwritten-ink');

		// Open migration modal and wait for confirm phase
		await browser.executeObsidian(({ app }) => {
			(app.plugins.plugins["ink"] as { openMigrationModal: () => void }).openMigrationModal();
		});
		await waitForMigrationConfirmPhase();

		// Click Cancel instead of migrating
		await browser.execute(() => {
			const buttons = document.querySelectorAll(".modal-container button");
			for (const btn of buttons) {
				if (btn.textContent?.trim() === 'Cancel') {
					(btn as HTMLElement).click();
					return;
				}
			}
		});
		await browser.pause(500);

		// Legacy .writing file must still exist
		const legacyStillExists = await browser.executeObsidian(({ app }) => {
			return !!app.vault.getAbstractFileByPath("Ink/Writing/migration-test-2.writing");
		});
		expect(legacyStillExists).toBe(true);

		// New .svg must NOT have been created
		const svgCreated = await browser.executeObsidian(({ app }) => {
			return !!app.vault.getAbstractFileByPath("Ink/Writing/migration-test-2.svg");
		});
		expect(svgCreated).toBe(false);

		// Note embed string must be unchanged
		const noteContentAfter = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath("13 - Migration Test/Legacy Writing Note.md");
			if (!file) return '';
			return app.vault.read(file as any);
		});
		expect(noteContentAfter).toContain('```handwritten-ink');
		expect(noteContentAfter).not.toContain('![InkWriting]');
	});
});

describe("Migration: multi-note embed update", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }) => !!app.plugins.plugins["ink"]),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
	});

	it("migration updates embed strings in ALL affected notes (writing and drawing)", async function () {
		// Full-vault permanent migrate of many legacy + SVG fixtures can exceed Mocha's default.
		this.timeout(120000);

		// Run the full migration
		await browser.executeObsidian(({ app }) => {
			(app.plugins.plugins["ink"] as { openMigrationModal: () => void }).openMigrationModal();
		});

		await waitForMigrationConfirmPhase();
		await clickMigratePermanentlyCard();

		await browser.waitUntil(
			async () => {
				const buttons = await browser.$$(".modal-container button");
				for (const btn of buttons) {
					if ((await btn.getText()).trim() === 'Done') return true;
				}
				return false;
			},
			{ timeout: 90000 }
		);

		await browser.execute(() => {
			const buttons = document.querySelectorAll(".modal-container button");
			for (const btn of buttons) {
				if (btn.textContent?.trim() === 'Done') {
					(btn as HTMLElement).click();
					break;
				}
			}
		});
		await browser.pause(500);

		// Both notes must have updated embed strings — verified together to
		// confirm multi-note updating (not just the first note)
		const writingNoteContent = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath("13 - Migration Test/Legacy Writing Note.md");
			return file ? app.vault.read(file as any) : '';
		});
		expect(writingNoteContent).toContain('![InkWriting]');
		expect(writingNoteContent).not.toContain('```handwritten-ink');

		const drawingNoteContent = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath("13 - Migration Test/Legacy Drawing Note.md");
			return file ? app.vault.read(file as any) : '';
		});
		expect(drawingNoteContent).toContain('![InkDrawing]');
		expect(drawingNoteContent).not.toContain('```handdrawn-ink');
	});
});
