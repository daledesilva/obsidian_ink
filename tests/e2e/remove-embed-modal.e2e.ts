import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function waitForPluginReady() {
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
		{ timeout: 15000 },
	);
}

/** Click a button in the open modal by its exact text label. */
async function clickModalButton(label: string) {
	await browser.execute((label: string) => {
		const buttons = document.querySelectorAll(".modal-container button");
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
			const buttons = await browser.$$(".modal-container button");
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
		const modal = document.querySelector(".modal-container");
		return modal?.textContent ?? "";
	});
}

/** Trigger openRemoveEmbedFlow programmatically. */
async function triggerRemoveEmbedFlow(
	embeddedFilePath: string,
	sourceMdPath: string,
	embedType: "inkWriting" | "inkDrawing",
) {
	await browser.executeObsidian(
		async ({ app }, { embeddedFilePath, sourceMdPath, embedType }) => {
			const plugin = (app.plugins.plugins as any)["ink"];
			if (!plugin) return;
			const embeddedFile = app.vault.getAbstractFileByPath(embeddedFilePath) as any;
			const sourceMdFile = app.vault.getAbstractFileByPath(sourceMdPath) as any;
			if (!embeddedFile || !sourceMdFile) return;
			plugin.openRemoveEmbedFlow(
				plugin,
				embeddedFile,
				sourceMdFile,
				embedType,
				() => {},
			);
		},
		{ embeddedFilePath, sourceMdPath, embedType },
	);
}

/** Trigger openRemoveEmbedFlow with a callback that actually removes the embed from the note. */
async function triggerRemoveEmbedFlowWithRemoval(
	embeddedFilePath: string,
	sourceMdPath: string,
	embedType: "inkWriting" | "inkDrawing",
) {
	await browser.executeObsidian(
		async ({ app }, { embeddedFilePath, sourceMdPath, embedType }) => {
			const plugin = (app.plugins.plugins as any)["ink"];
			if (!plugin) return;
			const embeddedFile = app.vault.getAbstractFileByPath(embeddedFilePath) as any;
			const sourceMdFile = app.vault.getAbstractFileByPath(sourceMdPath) as any;
			if (!embeddedFile || !sourceMdFile) return;
			const removeFromNote = async () =>
				plugin.removeAllEmbedsOfFileFromNote(
					plugin.app.vault,
					sourceMdFile,
					embeddedFile.path,
					embedType,
				);
			plugin.openRemoveEmbedFlow(
				plugin,
				embeddedFile,
				sourceMdFile,
				embedType,
				removeFromNote,
			);
		},
		{ embeddedFilePath, sourceMdPath, embedType },
	);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RemoveEmbedModal", function () {
	this.timeout(90000);

	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	// ─── 1. Modal opens and transitions from scan to confirm when file only in one note ─

	it("1. modal opens and transitions from scan to confirm when file only in one note", async function () {
		await obsidianPage.openFile("15 - Remove Embed/Single Note With Writing Only.md");
		await browser.pause(1500);

		await triggerRemoveEmbedFlow(
			"Ink/Writing/single-note-writing.svg",
			"15 - Remove Embed/Single Note With Writing Only.md",
			"inkWriting",
		);
		await browser.pause(500);

		const modal = await browser.$(".modal-container");
		await modal.waitForExist({ timeout: 15000 });
		await expect(modal).toExist();

		await waitForModalButton("Remove embed");
		await waitForModalButton("Remove embed and delete file");
		const text = await modalText();
		expect(text).toContain("writing");
		expect(text).toContain("only embedded in this note");
	});

	// ─── 2. No modal when file in multiple notes ─────────────────────────────

	it("2. no modal when file in multiple notes", async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();

		await browser.execute(() => {
			(window as any).__removeEmbedOnlyCalled = false;
		});

		await obsidianPage.openFile("15 - Remove Embed/Second Note With Same Writing.md");
		await browser.pause(500);

		await browser.executeObsidian(
			async ({ app }, { embeddedFilePath, sourceMdPath }) => {
				const plugin = (app.plugins.plugins as any)["ink"];
				if (!plugin) return;
				const embeddedFile = app.vault.getAbstractFileByPath(embeddedFilePath) as any;
				const sourceMdFile = app.vault.getAbstractFileByPath(sourceMdPath) as any;
				if (!embeddedFile || !sourceMdFile) return;
				plugin.openRemoveEmbedFlow(
					plugin,
					embeddedFile,
					sourceMdFile,
					"inkWriting",
					() => {
						(window as any).__removeEmbedOnlyCalled = true;
					},
				);
			},
			{
				embeddedFilePath: "Ink/Writing/remove-embed-test-writing.svg",
				sourceMdPath: "15 - Remove Embed/Second Note With Same Writing.md",
			},
		);

		await browser.pause(3000);

		const callbackCalled = await browser.execute(() => {
			return (window as any).__removeEmbedOnlyCalled === true;
		});
		const modal = await browser.$(".modal-container");
		const modalExists = await modal.isExisting();
		expect(modalExists).toBe(false);
		expect(callbackCalled).toBe(true);
	});

	// ─── 3. Remove embed only — embed removed, file remains ────────────────────

	it("3. Remove embed — embed removed, file remains", async function () {
		await obsidianPage.openFile("15 - Remove Embed/Single Note With Drawing.md");
		await browser.pause(1500);

		await triggerRemoveEmbedFlowWithRemoval(
			"Ink/Drawing/remove-embed-test-drawing.svg",
			"15 - Remove Embed/Single Note With Drawing.md",
			"inkDrawing",
		);
		await browser.pause(500);

		await waitForModalButton("Remove embed");
		await clickModalButton("Remove embed");
		await browser.pause(2000);

		const noteContent = await browser.executeObsidian(async ({ app }) => {
			const f = app.vault.getAbstractFileByPath(
				"15 - Remove Embed/Single Note With Drawing.md",
			) as any;
			return f ? app.vault.read(f) : "";
		});
		expect(noteContent).not.toContain("![InkDrawing](<Ink/Drawing/remove-embed-test-drawing.svg>)");

		const fileExists = await browser.executeObsidian(({ app }) => {
			return !!app.vault.getAbstractFileByPath(
				"Ink/Drawing/remove-embed-test-drawing.svg",
			);
		});
		expect(fileExists).toBe(true);
	});

	// ─── 4. Cancel leaves embed and file unchanged ────────────────────────────

	it("5. Cancel leaves embed and file unchanged", async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();

		await obsidianPage.openFile("15 - Remove Embed/Single Note With Drawing.md");
		await browser.pause(500);

		await triggerRemoveEmbedFlow(
			"Ink/Drawing/remove-embed-test-drawing.svg",
			"15 - Remove Embed/Single Note With Drawing.md",
			"inkDrawing",
		);
		await browser.pause(500);

		await waitForModalButton("Cancel");
		await clickModalButton("Cancel");
		await browser.pause(300);

		const noteContent = await browser.executeObsidian(async ({ app }) => {
			const f = app.vault.getAbstractFileByPath(
				"15 - Remove Embed/Single Note With Drawing.md",
			) as any;
			return f ? app.vault.read(f) : "";
		});
		expect(noteContent).toContain("remove-embed-test-drawing.svg");

		const fileExists = await browser.executeObsidian(({ app }) => {
			return !!app.vault.getAbstractFileByPath(
				"Ink/Drawing/remove-embed-test-drawing.svg",
			);
		});
		expect(fileExists).toBe(true);
	});

	// ─── 6. Drawing embed — same flows ────────────────────────────────────────

	it("6. Drawing embed — same scan and confirm flows", async function () {
		await obsidianPage.openFile("15 - Remove Embed/Single Note With Drawing.md");
		await browser.pause(1500);

		await triggerRemoveEmbedFlow(
			"Ink/Drawing/remove-embed-test-drawing.svg",
			"15 - Remove Embed/Single Note With Drawing.md",
			"inkDrawing",
		);
		await browser.pause(500);

		const modal = await browser.$(".modal-container");
		await modal.waitForExist({ timeout: 15000 });
		await waitForModalButton("Remove embed");
		const text = await modalText();
		expect(text).toContain("drawing");
	});

	// ─── 7. Remove embed from overflow menu (writing) ──────────────────────────

	it.skip("7. Remove embed from overflow menu (writing)", async function () {
		// Obsidian Menu DOM is not reliably findable in e2e (menu.showAtMouseEvent;
		// items may render in a different context). Flow coverage is via programmatic tests 1, 3, 6.
	});

	// ─── 8. Remove embed from overflow menu (drawing) ──────────────────────────

	it.skip("8. Remove embed from overflow menu (drawing)", async function () {
		// Obsidian Menu DOM is not reliably findable in e2e. Flow coverage is via programmatic tests 1, 3, 6.
	});

	// ─── 9. File in two notes — remove from one, no modal ──────────────────────

	it("9. File in two notes — remove from one, no modal, embed removed", async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();

		await obsidianPage.openFile("15 - Remove Embed/Second Note With Same Writing.md");
		await browser.pause(500);

		await triggerRemoveEmbedFlowWithRemoval(
			"Ink/Writing/remove-embed-test-writing.svg",
			"15 - Remove Embed/Second Note With Same Writing.md",
			"inkWriting",
		);
		await browser.pause(2000);

		const modal = await browser.$(".modal-container");
		const modalExists = await modal.isExisting();
		expect(modalExists).toBe(false);

		const secondNoteContent = await browser.executeObsidian(async ({ app }) => {
			const f = app.vault.getAbstractFileByPath(
				"15 - Remove Embed/Second Note With Same Writing.md",
			) as any;
			return f ? app.vault.read(f) : "";
		});
		expect(secondNoteContent).not.toContain("![InkWriting](<Ink/Writing/remove-embed-test-writing.svg>)");

		const fileExists = await browser.executeObsidian(({ app }) => {
			return !!app.vault.getAbstractFileByPath(
				"Ink/Writing/remove-embed-test-writing.svg",
			);
		});
		expect(fileExists).toBe(true);
	});

	// ─── 4. Remove embed and delete file — run last (destructive) ───────────────

	it("4. Remove embed and delete file — embed and file removed", async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();

		await obsidianPage.openFile("15 - Remove Embed/Single Note With Writing Only.md");
		await browser.pause(1500);

		await triggerRemoveEmbedFlow(
			"Ink/Writing/single-note-writing.svg",
			"15 - Remove Embed/Single Note With Writing Only.md",
			"inkWriting",
		);
		await browser.pause(500);

		await waitForModalButton("Remove embed and delete file", 20000);
		await clickModalButton("Remove embed and delete file");
		await browser.pause(2000);

		const noteContent = await browser.executeObsidian(async ({ app }) => {
			const f = app.vault.getAbstractFileByPath(
				"15 - Remove Embed/Single Note With Writing Only.md",
			) as any;
			return f ? app.vault.read(f) : "";
		});
		expect(noteContent).not.toContain("![InkWriting](<Ink/Writing/single-note-writing.svg>)");

		const fileExists = await browser.executeObsidian(({ app }) => {
			return !!app.vault.getAbstractFileByPath(
				"Ink/Writing/single-note-writing.svg",
			);
		});
		expect(fileExists).toBe(false);
	});
});
