import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

////////
// Shared setup

async function waitForPluginReady() {
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
		{ timeout: 15000 }
	);
}

////////
// Interaction helpers

// Opens an embed file and triggers immediate editor activation via the localStorage
// flag that all embed components (both current-format and v1) check on mount.
// Clicking the preview directly inside a CodeMirror widget is not reliable in the
// automated test environment — this is the same approach used by buffer-lines.e2e.ts.
async function openEditorViaFlag(notePath: string, editorSelector: string) {
	await browser.execute(() => {
		localStorage.setItem("ddc_ink_activateNextEmbed", "true");
	});
	await obsidianPage.openFile(notePath);
	const editor = await browser.$(editorSelector);
	await editor.waitForExist({ timeout: 15000 });
	// Brief settle so tldraw finishes mounting before we interact further.
	await browser.pause(500);
}

// Clicks the lock button and waits for the full transition to complete:
// the preview must appear AND the editor must fully unmount.
// The embed state machine passes through a "loadingPreview" intermediate state
// where both the preview and editor are simultaneously mounted, so a simple
// "preview exists" check is not sufficient — we must also wait for the editor
// to disappear.
async function clickLockAndWait(previewSelector: string, editorSelector: string) {
	// The lock button is the first <button> inside .ink_extended-writing-menu,
	// rendered by both ExtendedWritingMenu and ExtendedDrawingMenu.
	const lockBtn = await browser.$(".ink_extended-writing-menu button");
	await lockBtn.waitForExist({ timeout: 5000 });
	await lockBtn.click();

	const preview = await browser.$(previewSelector);
	await preview.waitForExist({ timeout: 10000 });

	const editor = await browser.$(editorSelector);
	await editor.waitForExist({ reverse: true, timeout: 10000 });
}

////////
////////

describe("Embed Lock/Unlock — Current Writing", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
	});

	it("unlocks and re-locks without breaking the embed", async function () {
		await openEditorViaFlag(
			"01 - Basic Embeds/Single Writing Embed.md",
			".ddc_ink_writing-editor",
		);
		await expect(await browser.$(".ddc_ink_writing-editor")).toExist();

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await expect(await browser.$(".ddc_ink_writing-embed-preview")).toExist();
		await expect(await browser.$(".ddc_ink_writing-editor")).not.toExist();
	});
});

////////
////////

describe("Embed Lock/Unlock — Current Drawing", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
	});

	it("unlocks and re-locks without breaking the embed", async function () {
		await openEditorViaFlag(
			"01 - Basic Embeds/Single Drawing Embed.md",
			".ddc_ink_drawing-editor",
		);
		await expect(await browser.$(".ddc_ink_drawing-editor")).toExist();

		await clickLockAndWait(".ddc_ink_drawing-embed-preview", ".ddc_ink_drawing-editor");
		await expect(await browser.$(".ddc_ink_drawing-embed-preview")).toExist();
		await expect(await browser.$(".ddc_ink_drawing-editor")).not.toExist();
	});
});

////////
////////

describe("Embed Lock/Unlock — Legacy v1 Writing", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
	});

	it("unlocks and re-locks without breaking the embed", async function () {
		// v1 embeds are rendered inside CM code-block processors where direct
		// WebDriver clicks are not reliably forwarded to React. Use the same
		// localStorage activation flag that buffer-lines.e2e.ts uses.
		await openEditorViaFlag(
			"02 - Legacy Format/V1 Writing Embed.md",
			".ddc_ink_writing-editor",
		);
		await expect(await browser.$(".ddc_ink_writing-editor")).toExist();

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await expect(await browser.$(".ddc_ink_writing-embed-preview")).toExist();
		await expect(await browser.$(".ddc_ink_writing-editor")).not.toExist();
	});
});

////////
////////

describe("Embed Lock/Unlock — Legacy v1 Drawing", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
	});

	it("unlocks and re-locks without breaking the embed", async function () {
		await openEditorViaFlag(
			"02 - Legacy Format/V1 Drawing Embed.md",
			".ddc_ink_drawing-editor",
		);
		await expect(await browser.$(".ddc_ink_drawing-editor")).toExist();

		await clickLockAndWait(".ddc_ink_drawing-embed-preview", ".ddc_ink_drawing-editor");
		await expect(await browser.$(".ddc_ink_drawing-embed-preview")).toExist();
		await expect(await browser.$(".ddc_ink_drawing-editor")).not.toExist();
	});

	it("code block JSON remains valid after locking (regression: JSON corruption bug)", async function () {
		// v1 drawing: locking calls updateEmbed_v1 which rewrites the JSON inside
		// the handdrawn-ink code fence. A previous bug appended properties outside
		// the closing brace, producing invalid JSON that JSON.parse rejects.
		await openEditorViaFlag(
			"02 - Legacy Format/V1 Drawing Embed.md",
			".ddc_ink_drawing-editor",
		);

		await clickLockAndWait(".ddc_ink_drawing-embed-preview", ".ddc_ink_drawing-editor");

		// Allow Obsidian to flush the CodeMirror change to the vault file on disk.
		await browser.pause(2000);

		const noteContent = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getFileByPath("02 - Legacy Format/V1 Drawing Embed.md");
			if (!file) return null;
			return app.vault.read(file);
		});

		expect(noteContent).not.toBeNull();

		const match = (noteContent as string).match(/```handdrawn-ink\n([\s\S]*?)\n```/);
		expect(match).not.toBeNull();

		const jsonStr = match![1];
		// JSON.parse throws if properties were appended outside the closing brace.
		expect(() => JSON.parse(jsonStr)).not.toThrow();
	});
});
