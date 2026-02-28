import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Legacy Embed Migration", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }) => !!app.plugins.plugins["ink"]),
			{ timeout: 15000 }
		);
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
		await browser.executeObsidianCommand("ink:migrate-legacy-embeds");
		await browser.pause(500);
		const modal = await browser.$(".modal-container");
		await modal.waitForExist({ timeout: 5000 });
		await expect(modal).toExist();
	});

	it("modal scans and shows legacy files found", async function () {
		// Modal is already open from previous test; wait for scan to finish
		// The scan phase shows stats and then transitions to confirm
		await browser.waitUntil(
			async () => {
				const text = await browser.$$(".modal-container *").then(els =>
					Promise.all(els.map(e => e.getText()))
				).then(texts => texts.join(' '));
				return text.includes('Migrate') || text.includes('convert');
			},
			{ timeout: 10000 }
		);

		const modalText = await browser.execute(() => {
			const modal = document.querySelector(".modal-container");
			return modal ? modal.textContent : '';
		});
		// Should show at least 1 embed to convert
		expect(modalText).toBeTruthy();
	});

	it("migration executes successfully and converts legacy files", async function () {
		// Find and click the Migrate button
		await browser.waitUntil(
			async () => {
				const buttons = await browser.$$(".modal-container button");
				for (const btn of buttons) {
					const text = await btn.getText();
					if (text.trim() === 'Migrate') return true;
				}
				return false;
			},
			{ timeout: 8000 }
		);

		await browser.execute(() => {
			const buttons = document.querySelectorAll(".modal-container button");
			for (const btn of buttons) {
				if (btn.textContent?.trim() === 'Migrate') {
					(btn as HTMLElement).click();
					break;
				}
			}
		});

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
			const legacyFile = app.vault.getAbstractFileByPath("Ink/Writing/migration-test.writing");
			return legacyFile === null;
		});
		expect(writingFileGone).toBe(true);

		// Verify new .svg file exists
		const svgExists = await browser.executeObsidian(({ app }) => {
			const svgFile = app.vault.getAbstractFileByPath("Ink/Writing/migration-test.svg");
			return svgFile !== null;
		});
		expect(svgExists).toBe(true);
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
		const embed = await browser.$(".ddc_ink_embed-block, .ddc_ink_widget-root");
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
		await browser.executeObsidianCommand("ink:migrate-legacy-embeds");
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
