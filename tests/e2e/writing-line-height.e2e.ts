import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";
import { setActivateNextEmbedInLocalStorage } from "./helpers/ink-local-storage";

////////
// Notes

const FIXTURE_NOTE = "05 - Settings Variations/Line Height 200 Fixture.md";

////////
// Helpers

async function waitForPluginReady() {
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
		{ timeout: 15000 }
	);
}

// Opens an embed file and triggers immediate editor activation via the localStorage
// flag that all embed components check on mount.
async function openEditorViaFlag(notePath: string) {
	await setActivateNextEmbedInLocalStorage();
	await obsidianPage.openFile(notePath);
	await browser.waitUntil(
		() => browser.execute(() => !!document.querySelector(".tl-container")),
		{ timeout: 15000, interval: 200 }
	);
	// Brief settle so tldraw finishes mounting and the SVG metadata is injected.
	await browser.pause(500);
}

// Clicks the lock button and waits for the transition to complete:
// preview must appear AND editor must fully unmount.
async function clickLockAndWait() {
	const lockBtn = await browser.$(".ink_extended-writing-menu button");
	await lockBtn.waitForExist({ timeout: 5000 });
	await lockBtn.click();

	const preview = await browser.$(".ddc_ink_writing-embed-preview");
	await preview.waitForExist({ timeout: 10000 });

	const editor = await browser.$(".ddc_ink_writing-editor");
	await editor.waitForExist({ reverse: true, timeout: 10000 });
}

async function setWritingLineHeight(value: number) {
	await browser.execute((v: number) => {
		(window as any).__inkTestLH = v;
	}, value);
	await browser.executeObsidian(async ({ app }) => {
		const plugin = (app.plugins.plugins as any)["ink"];
		if (plugin) {
			plugin.settings.writingLineHeight = (window as any).__inkTestLH;
			await plugin.saveSettings();
		}
	});
}

async function readFixtureSvg(): Promise<string> {
	return browser.executeObsidian(({ app }) => {
		return (app.vault.adapter as any).read(
			"Ink/Writing/line-height-200-fixture.svg"
		);
	});
}

////////
////////

describe("Writing Line Height — Per-File Isolation", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	afterEach(async function () {
		// Reset global setting after each test so other suites are not affected.
		await setWritingLineHeight(150);
	});

	it("per-file line height is preserved when global setting differs", async function () {
		// Set global setting to a different value than the fixture's per-file value.
		await setWritingLineHeight(300);

		// Open and activate the fixture that has writing-line-height="200" in its SVG.
		await openEditorViaFlag(FIXTURE_NOTE);
		await expect(await browser.$(".ddc_ink_writing-editor")).toExist();

		// Lock the embed — this triggers completeSave which reads the per-file
		// line height from the tldraw store (injected during mount from the SVG attribute).
		await clickLockAndWait();
		await expect(await browser.$(".ddc_ink_writing-embed-preview")).toExist();

		// Read the saved SVG back from disk.
		const svgContent = await readFixtureSvg();

		// The per-file attribute must be "200" regardless of the global setting (300).
		expect(svgContent).toContain('writing-line-height="200"');
		expect(svgContent).not.toContain('writing-line-height="300"');
	});

	it("per-file line height attribute round-trips through a lock cycle", async function () {
		// Confirm the attribute survives an open → lock cycle even without editing.
		await openEditorViaFlag(FIXTURE_NOTE);
		await expect(await browser.$(".ddc_ink_writing-editor")).toExist();

		await clickLockAndWait();
		await expect(await browser.$(".ddc_ink_writing-embed-preview")).toExist();

		const svgContent = await readFixtureSvg();
		expect(svgContent).toContain('writing-line-height="200"');
	});
});
