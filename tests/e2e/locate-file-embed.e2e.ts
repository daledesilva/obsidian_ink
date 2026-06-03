import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

const EMBED_SELECTOR = ".ddc_ink_embed-block, .ddc_ink_widget-root";
const NOT_FOUND_BANNER = ".ddc_ink_pending-banner--not-found";
const SVG_PICKER_ITEM = ".ink-svg-picker-item";
const SECTION_HEADER = ".ink-svg-picker-section-header";
const LOCAL_STORAGE_PREFIX = "AU_";

/** Click the Locate file button via execute (bypasses interactability checks for embed widget buttons). */
async function clickLocateFileButton() {
	await browser.execute(() => {
		const buttons = document.querySelectorAll('button');
		for (const btn of buttons) {
			if (btn.textContent?.trim() === 'Locate file') {
				(btn as HTMLElement).click();
				return;
			}
		}
	});
}

/** Click the first file card in the SVG picker modal via execute. */
async function clickFirstSvgPickerItem() {
	await browser.execute(() => {
		const card = document.querySelector('.ink-svg-picker-item');
		if (card instanceof HTMLElement) card.click();
	});
}

/** Clear recent file paths from localStorage so the Recent section is empty. */
async function clearRecentFilePaths() {
	await browser.execute((prefix: string) => {
		localStorage.removeItem(`${prefix}recentDrawingFilePaths`);
		localStorage.removeItem(`${prefix}recentWritingFilePaths`);
	}, LOCAL_STORAGE_PREFIX);
}

/** Get the text of all visible section headers in the SVG picker modal. */
async function getSectionHeaderTexts(): Promise<string[]> {
	const headers = await $$(SECTION_HEADER);
	const texts: string[] = [];
	for (const header of headers) {
		const text = await header.getText();
		if (text) texts.push(text);
	}
	return texts;
}

describe("Locate File Embed", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
	});

	it("file-not-found banner shows path and Locate button", async function () {
		await obsidianPage.openFile("09 - Edge Cases and Error States/Missing File Reference.md");
		await browser.pause(500);

		const notFoundBanner = await $(NOT_FOUND_BANNER);
		await notFoundBanner.waitForExist({ timeout: 10000 });
		await expect(notFoundBanner).toExist();

		const bannerText = await notFoundBanner.getText();
		expect(bannerText).toContain("nonexistent.svg");

		const locateButton = await $('button=Locate file');
		await expect(locateButton).toExist();
	});

	// TODO: Debug - file selection and embed update work manually but fail in e2e.
	// Suspect: view/editor context when modal opens, or async timing of updateEmbedFilepath.
	it.skip("Locate file — writing — updates embed", async function () {
		await obsidianPage.openFile("09 - Edge Cases and Error States/Missing File Reference.md");
		await browser.pause(500);

		const locateButton = await $('button=Locate file');
		await locateButton.waitForExist({ timeout: 10000 });
		await clickLocateFileButton();

		const firstFileCard = await $(SVG_PICKER_ITEM);
		await firstFileCard.waitForExist({ timeout: 15000 });
		await clickFirstSvgPickerItem();

		// Wait for modal to close
		await browser.waitUntil(
			async () => (await $$(SVG_PICKER_ITEM)).length === 0,
			{ timeout: 5000 }
		);

		// Wait for embed to update and show preview (CodeMirror/React may need a tick)
		await browser.pause(1000);
		const resizeContainer = await $(".ddc_ink_resize-container");
		await resizeContainer.waitForExist({ timeout: 10000 });
		await expect(resizeContainer).toExist();

		const notFoundBanner = await $(NOT_FOUND_BANNER);
		await expect(notFoundBanner).not.toExist();
	});

	it.skip("Locate file — drawing — updates embed", async function () {
		await obsidianPage.openFile("09 - Edge Cases and Error States/Missing Drawing Reference.md");
		await browser.pause(500);

		const locateButton = await $('button=Locate file');
		await locateButton.waitForExist({ timeout: 10000 });
		await clickLocateFileButton();

		const firstFileCard = await $(SVG_PICKER_ITEM);
		await firstFileCard.waitForExist({ timeout: 15000 });
		await clickFirstSvgPickerItem();

		await browser.waitUntil(
			async () => (await $$(SVG_PICKER_ITEM)).length === 0,
			{ timeout: 5000 }
		);
		await browser.pause(1000);

		const resizeContainer = await $(".ddc_ink_resize-container");
		await resizeContainer.waitForExist({ timeout: 10000 });
		await expect(resizeContainer).toExist();

		const notFoundBanner = await $(NOT_FOUND_BANNER);
		await expect(notFoundBanner).not.toExist();
	});

	it.skip("Locate preserves isPending — reference/duplicate banner still shows", async function () {
		await obsidianPage.openFile("09 - Edge Cases and Error States/Missing File Pending Paste.md");
		await browser.pause(500);

		const locateButton = await $('button=Locate file');
		await locateButton.waitForExist({ timeout: 10000 });
		await clickLocateFileButton();

		const firstFileCard = await $(SVG_PICKER_ITEM);
		await firstFileCard.waitForExist({ timeout: 15000 });
		await clickFirstSvgPickerItem();

		await browser.waitUntil(
			async () => (await $$(SVG_PICKER_ITEM)).length === 0,
			{ timeout: 5000 }
		);
		await browser.pause(1000);

		// After Locate, the reference/duplicate banner should appear (embed still pending)
		const referenceButton = await $('button=Reference existing file');
		await referenceButton.waitForExist({ timeout: 10000 });
		await expect(referenceButton).toExist();
	});

	it("Insert existing writing file command", async function () {
		await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
		await browser.pause(500);

		await browser.executeObsidianCommand("ink:embed-writing-file");
		await browser.pause(500);

		const firstFileCard = await $(SVG_PICKER_ITEM);
		await firstFileCard.waitForExist({ timeout: 10000 });
		await firstFileCard.click();
		await browser.pause(1000);

		const embeds = await $$(EMBED_SELECTOR);
		expect(embeds.length).toBeGreaterThanOrEqual(2);
	});

	it("Insert existing drawing file command", async function () {
		await obsidianPage.openFile("01 - Basic Embeds/Single Drawing Embed.md");
		await browser.pause(500);

		await browser.executeObsidianCommand("ink:embed-drawing-file");
		await browser.pause(500);

		const firstFileCard = await $(SVG_PICKER_ITEM);
		await firstFileCard.waitForExist({ timeout: 10000 });
		await firstFileCard.click();
		await browser.pause(1000);

		const embeds = await $$(EMBED_SELECTOR);
		expect(embeds.length).toBeGreaterThanOrEqual(2);
	});

	it("Recent section does not show when there are no recents", async function () {
		await clearRecentFilePaths();
		await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
		await browser.pause(500);

		await browser.executeObsidianCommand("ink:embed-writing-file");
		await browser.pause(500);

		const firstFileCard = await $(SVG_PICKER_ITEM);
		await firstFileCard.waitForExist({ timeout: 10000 });

		const headerTexts = await getSectionHeaderTexts();
		const hasRecentWriting = headerTexts.some((t) => t === "Recent writing");
		expect(hasRecentWriting).toBe(false);

		await firstFileCard.click();
		await browser.pause(500);
	});

	it("Recent section shows when there are recents", async function () {
		await clearRecentFilePaths();
		await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
		await browser.pause(500);

		await browser.executeObsidianCommand("ink:embed-writing-file");
		await browser.pause(500);
		const firstFileCard = await $(SVG_PICKER_ITEM);
		await firstFileCard.waitForExist({ timeout: 10000 });
		await firstFileCard.click();
		await browser.pause(500);

		await browser.executeObsidianCommand("ink:embed-writing-file");
		await browser.pause(500);
		const cardAfterSelect = await $(SVG_PICKER_ITEM);
		await cardAfterSelect.waitForExist({ timeout: 10000 });

		const headerTexts = await getSectionHeaderTexts();
		const hasRecentWriting = headerTexts.some((t) => t === "Recent writing");
		expect(hasRecentWriting).toBe(true);

		await cardAfterSelect.click();
		await browser.pause(500);
	});

	it("On current page section does not show when note has no ink embeds", async function () {
		await obsidianPage.openFile("08 - Plugin Compatibility/Hover Editor - Popover Test.md");
		await browser.pause(500);

		await browser.executeObsidianCommand("ink:embed-writing-file");
		await browser.pause(500);

		const firstFileCard = await $(SVG_PICKER_ITEM);
		await firstFileCard.waitForExist({ timeout: 10000 });

		const headerTexts = await getSectionHeaderTexts();
		const hasOnCurrentPage = headerTexts.some((t) => t === "On current page");
		expect(hasOnCurrentPage).toBe(false);

		await firstFileCard.click();
		await browser.pause(500);
	});

	it("On current page section shows when note has ink embeds", async function () {
		await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
		await browser.pause(500);

		await browser.executeObsidianCommand("ink:embed-writing-file");
		await browser.pause(500);

		const firstFileCard = await $(SVG_PICKER_ITEM);
		await firstFileCard.waitForExist({ timeout: 10000 });

		const headerTexts = await getSectionHeaderTexts();
		const hasOnCurrentPage = headerTexts.some((t) => t === "On current page");
		expect(hasOnCurrentPage).toBe(true);

		await firstFileCard.click();
		await browser.pause(500);
	});
});
