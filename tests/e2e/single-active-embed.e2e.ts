import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

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
// Setting helpers

async function setBooxConnectionEnabled(enabled: boolean) {
	await browser.execute((v: boolean) => {
		(window as any).__inkTestBooxEnabled = v;
	}, enabled);
	await browser.executeObsidian(async ({ app }) => {
		const plugin = (app.plugins.plugins as any)["ink"];
		if (plugin) {
			plugin.setBooxConnectionEnabledForTests((window as any).__inkTestBooxEnabled);
		}
	});
}

////////
// Interaction helpers

async function openEditorViaFlag(notePath: string, editorSelector: string) {
	await browser.execute(() => {
		localStorage.setItem("AU_activateNextEmbed", "true");
	});
	await obsidianPage.openFile(notePath);
	const editor = await browser.$(editorSelector);
	await editor.waitForExist({ timeout: 15000 });
	await browser.pause(500);
}

/**
 * Click the Nth preview element (0-indexed) matching the given selector
 * to unlock a second embed after one is already open.
 */
async function clickNthPreview(previewSelector: string, index: number) {
	await browser.execute(
		(sel: string, idx: number) => {
			const previews = document.querySelectorAll(sel);
			if (previews[idx]) {
				(previews[idx] as HTMLElement).click();
			}
		},
		previewSelector,
		index,
	);
	// Allow the editor state transition to settle
	await browser.pause(1000);
}

function countElements(selector: string): Promise<number> {
	return browser.execute((sel: string) => {
		return document.querySelectorAll(sel).length;
	}, selector);
}

////////
////////

const MIXED_NOTE = "01 - Basic Embeds/Mixed Writing and Drawing.md";
const MULTI_WRITING_NOTE = "01 - Basic Embeds/Multiple Writing Embeds.md";
const MULTI_DRAWING_NOTE = "01 - Basic Embeds/Multiple Drawing Embeds.md";

const ACTIVE_LEAF = ".workspace-leaf.mod-active";
const WRITING_EDITOR = `${ACTIVE_LEAF} .ddc_ink_writing-editor`;
const DRAWING_EDITOR = `${ACTIVE_LEAF} .ddc_ink_drawing-editor`;
const WRITING_PREVIEW = `${ACTIVE_LEAF} .ddc_ink_writing-embed-preview`;
const DRAWING_PREVIEW = `${ACTIVE_LEAF} .ddc_ink_drawing-embed-preview`;

////////
////////

describe("Single Active Embed — Boox enabled", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
		await setBooxConnectionEnabled(true);
	});

	after(async function () {
		// Reset setting so other tests are not affected
		await setBooxConnectionEnabled(false);
	});

	it("unlocking a second writing embed closes the first", async function () {
		// Open a note with multiple writing embeds and unlock the first one
		await openEditorViaFlag(MULTI_WRITING_NOTE, WRITING_EDITOR);

		const editorsBeforeSecondUnlock = await countElements(WRITING_EDITOR);
		expect(editorsBeforeSecondUnlock).toBe(1);

		// Click a remaining preview to unlock a second embed
		await clickNthPreview(WRITING_PREVIEW, 0);

		// Wait for the state transition
		await browser.waitUntil(
			async () => {
				const editors = await countElements(WRITING_EDITOR);
				// The first editor should have been saved and closed,
				// and the second should now be open — still only 1 editor.
				return editors === 1;
			},
			{ timeout: 10000, timeoutMsg: "Expected exactly 1 writing editor after unlocking second embed" },
		);

		const editorsAfter = await countElements(WRITING_EDITOR);
		expect(editorsAfter).toBe(1);

		// The previously-open embed should now show a preview
		const previewCount = await countElements(WRITING_PREVIEW);
		expect(previewCount).toBeGreaterThanOrEqual(1);
	});

	it("unlocking a second drawing embed closes the first", async function () {
		// Open a note with multiple drawing embeds and unlock the first one
		await openEditorViaFlag(MULTI_DRAWING_NOTE, DRAWING_EDITOR);

		const editorsBeforeSecondUnlock = await countElements(DRAWING_EDITOR);
		expect(editorsBeforeSecondUnlock).toBe(1);

		// Click a remaining preview to unlock a second embed
		await clickNthPreview(DRAWING_PREVIEW, 0);

		// Wait for the state transition
		await browser.waitUntil(
			async () => {
				const editors = await countElements(DRAWING_EDITOR);
				return editors === 1;
			},
			{ timeout: 10000, timeoutMsg: "Expected exactly 1 drawing editor after unlocking second embed" },
		);

		const editorsAfter = await countElements(DRAWING_EDITOR);
		expect(editorsAfter).toBe(1);

		// The previously-open embed should now show a preview
		const previewCount = await countElements(DRAWING_PREVIEW);
		expect(previewCount).toBeGreaterThanOrEqual(1);
	});

	it("unlocking a drawing embed closes an open writing embed", async function () {
		// Open a mixed note and unlock the first writing embed
		await openEditorViaFlag(MIXED_NOTE, WRITING_EDITOR);

		const writingEditorsBefore = await countElements(WRITING_EDITOR);
		expect(writingEditorsBefore).toBe(1);
		const drawingEditorsBefore = await countElements(DRAWING_EDITOR);
		expect(drawingEditorsBefore).toBe(0);

		// Click a drawing preview to unlock it
		await clickNthPreview(DRAWING_PREVIEW, 0);

		// Wait for the drawing editor to appear
		await browser.waitUntil(
			async () => (await countElements(DRAWING_EDITOR)) === 1,
			{ timeout: 10000, timeoutMsg: "Expected drawing editor to open" },
		);

		// The writing editor should have been closed
		await browser.waitUntil(
			async () => (await countElements(WRITING_EDITOR)) === 0,
			{ timeout: 10000, timeoutMsg: "Expected writing editor to close when drawing opened" },
		);
	});

	it("unlocking a writing embed closes an open drawing embed", async function () {
		// Navigate away to reset embed state
		await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
		await browser.pause(500);

		// Open the mixed note — the flag will unlock the first embed (writing)
		await openEditorViaFlag(MIXED_NOTE, WRITING_EDITOR);

		// Lock the writing editor to return to all-preview state
		const lockBtn = await browser.$(".ink_extended-writing-menu button");
		if (await lockBtn.isExisting()) {
			await lockBtn.click();
			await browser.pause(1000);
		}

		// Now unlock a drawing embed
		await clickNthPreview(DRAWING_PREVIEW, 0);
		await browser.waitUntil(
			async () => (await countElements(DRAWING_EDITOR)) === 1,
			{ timeout: 10000, timeoutMsg: "Expected drawing editor to open" },
		);

		// Now unlock a writing embed — it should close the drawing embed
		await clickNthPreview(WRITING_PREVIEW, 0);
		await browser.waitUntil(
			async () => (await countElements(WRITING_EDITOR)) === 1,
			{ timeout: 10000, timeoutMsg: "Expected writing editor to open" },
		);
		await browser.waitUntil(
			async () => (await countElements(DRAWING_EDITOR)) === 0,
			{ timeout: 10000, timeoutMsg: "Expected drawing editor to close when writing opened" },
		);
	});
});

////////
////////

describe("Single Active Embed — Boox disabled (no restriction)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
		await setBooxConnectionEnabled(false);
	});

	it("allows multiple writing embeds to be open simultaneously", async function () {
		// Open a note with multiple writing embeds and unlock the first one
		await openEditorViaFlag(MULTI_WRITING_NOTE, WRITING_EDITOR);

		const editorsAfterFirst = await countElements(WRITING_EDITOR);
		expect(editorsAfterFirst).toBe(1);

		// Click a remaining preview to unlock a second embed
		await clickNthPreview(WRITING_PREVIEW, 0);

		// Wait for the second editor to appear
		await browser.waitUntil(
			async () => (await countElements(WRITING_EDITOR)) >= 2,
			{ timeout: 10000, timeoutMsg: "Expected at least 2 writing editors when Boox is disabled" },
		);

		const editorsAfterSecond = await countElements(WRITING_EDITOR);
		expect(editorsAfterSecond).toBeGreaterThanOrEqual(2);
	});

	it("allows multiple drawing embeds open simultaneously", async function () {
		// Open a note with multiple drawing embeds and unlock the first one
		await openEditorViaFlag(MULTI_DRAWING_NOTE, DRAWING_EDITOR);

		const editorsAfterFirst = await countElements(DRAWING_EDITOR);
		expect(editorsAfterFirst).toBe(1);

		// Click a remaining preview to unlock a second embed
		await clickNthPreview(DRAWING_PREVIEW, 0);

		// Wait for the second editor to appear
		await browser.waitUntil(
			async () => (await countElements(DRAWING_EDITOR)) >= 2,
			{ timeout: 10000, timeoutMsg: "Expected at least 2 drawing editors when Boox is disabled" },
		);

		const editorsAfterSecond = await countElements(DRAWING_EDITOR);
		expect(editorsAfterSecond).toBeGreaterThanOrEqual(2);
	});

	it("allows writing and drawing embeds open at the same time", async function () {
		// Open a mixed note and unlock the first writing embed
		await openEditorViaFlag(MIXED_NOTE, WRITING_EDITOR);

		const writingBefore = await countElements(WRITING_EDITOR);
		expect(writingBefore).toBe(1);

		// Click a drawing preview to unlock it
		await clickNthPreview(DRAWING_PREVIEW, 0);

		// Wait for the drawing editor to appear
		await browser.waitUntil(
			async () => (await countElements(DRAWING_EDITOR)) >= 1,
			{ timeout: 10000, timeoutMsg: "Expected drawing editor to open alongside writing editor" },
		);

		// Writing editor should still be open
		const writingAfter = await countElements(WRITING_EDITOR);
		expect(writingAfter).toBe(1);
		const drawingAfter = await countElements(DRAWING_EDITOR);
		expect(drawingAfter).toBe(1);
	});
});
