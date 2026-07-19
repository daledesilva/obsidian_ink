import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

/** Open the FileConversionModal for the given file and wait for the Convert button, then click it. */
async function convertFileViaModal(filePath: string, toType: 'inkDrawing' | 'inkWriting') {
	await browser.executeObsidian(async ({ app }, args) => {
		const { filePath, toType } = args as { filePath: string; toType: string };
		const plugin = (app.plugins.plugins as any)['ink'];
		if (!plugin) return;
		const file = app.vault.getAbstractFileByPath(filePath);
		if (!file) return;
		new plugin.FileConversionModal(plugin, file, toType).open();
	}, { filePath, toType });

	await browser.pause(500);

	// Wait for the modal to reach the confirm phase
	await browser.waitUntil(
		async () => {
			const buttons = await browser.$$('.modal-container button');
			for (const btn of buttons) {
				if ((await btn.getText()).trim() === 'Convert') return true;
			}
			return false;
		},
		{ timeout: 10000 }
	);

	// Uncheck the move checkbox so the file stays at its original path
	await browser.execute(() => {
		const checkbox = document.querySelector('#ddc_ink_move-checkbox') as HTMLInputElement;
		if (checkbox) checkbox.checked = false;
	});

	await browser.execute(() => {
		const buttons = document.querySelectorAll('.modal-container button');
		for (const btn of buttons) {
			if (btn.textContent?.trim() === 'Convert') {
				(btn as HTMLElement).click();
				break;
			}
		}
	});
	await browser.pause(1500);
}

describe("File Conversion (write <-> draw)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }) => !!app.plugins.plugins["ink"]),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
	});

	it("converts a writing SVG to drawing via pane menu", async function () {
		const filePath = "Ink/Writing/Writing To Convert.svg";
		await obsidianPage.openFile(filePath);
		await browser.pause(1000);

		await convertFileViaModal(filePath, 'inkDrawing');

		const fileType = await browser.executeObsidian(async ({ app }, filePath) => {
			const file = app.vault.getAbstractFileByPath(filePath as string);
			if (!file) return null;
			const content = await app.vault.read(file as any);
			const match = content.match(/file-type="([^"]+)"/);
			return match ? match[1] : null;
		}, filePath);

		expect(fileType).toBe("inkDrawing");
	});

	it("converts a drawing SVG to writing via pane menu", async function () {
		const filePath = "Ink/Drawing/Drawing To Convert.svg";
		await obsidianPage.openFile(filePath);
		await browser.pause(1000);

		await convertFileViaModal(filePath, 'inkWriting');

		const fileType = await browser.executeObsidian(async ({ app }, filePath) => {
			const file = app.vault.getAbstractFileByPath(filePath as string);
			if (!file) return null;
			const content = await app.vault.read(file as any);
			const match = content.match(/file-type="([^"]+)"/);
			return match ? match[1] : null;
		}, filePath);

		expect(fileType).toBe("inkWriting");
	});

	it("file remains at the same .svg path after conversion (no rename)", async function () {
		const filePath = "Ink/Writing/Writing To Convert.svg";

		const fileExists = await browser.executeObsidian(({ app }, filePath) => {
			const file = app.vault.getAbstractFileByPath(filePath as string);
			return !!file;
		}, filePath);

		expect(fileExists).toBe(true);
	});

	it("converts ink-canvas writing SVG to drawing via pane menu", async function () {
		const filePath = "Ink/Writing/Ink Canvas Writing To Convert.svg";
		await obsidianPage.openFile(filePath);
		await browser.pause(1000);

		await convertFileViaModal(filePath, 'inkDrawing');

		const fileMeta = await browser.executeObsidian(async ({ app }, filePath) => {
			const file = app.vault.getAbstractFileByPath(filePath as string);
			if (!file) return null;
			const content = await app.vault.read(file as any);
			const fileTypeMatch = content.match(/file-type="([^"]+)"/);
			return {
				fileType: fileTypeMatch ? fileTypeMatch[1] : null,
				hasInkCanvas: content.includes('<ink-canvas'),
				hasTldraw: content.includes('<tldraw'),
			};
		}, filePath);

		expect(fileMeta?.fileType).toBe("inkDrawing");
		expect(fileMeta?.hasInkCanvas).toBe(true);
		expect(fileMeta?.hasTldraw).toBe(false);
	});

	it("converts ink-canvas drawing SVG to writing via pane menu", async function () {
		const filePath = "Ink/Drawing/Ink Canvas Drawing To Convert.svg";
		await obsidianPage.openFile(filePath);
		await browser.pause(1000);

		await convertFileViaModal(filePath, 'inkWriting');

		const fileMeta = await browser.executeObsidian(async ({ app }, filePath) => {
			const file = app.vault.getAbstractFileByPath(filePath as string);
			if (!file) return null;
			const content = await app.vault.read(file as any);
			const fileTypeMatch = content.match(/file-type="([^"]+)"/);
			return {
				fileType: fileTypeMatch ? fileTypeMatch[1] : null,
				hasWritingGuides: content.includes('stroke-opacity="0.5"'),
			};
		}, filePath);

		expect(fileMeta?.fileType).toBe("inkWriting");
		expect(fileMeta?.hasWritingGuides).toBe(true);
	});

	it("round-trip write -> draw -> write preserves file validity", async function () {
		const filePath = "Ink/Drawing/Drawing To Convert.svg";

		// It was converted to inkWriting in test 2; convert back to inkDrawing for round-trip
		await convertFileViaModal(filePath, 'inkDrawing');

		const isValid = await browser.executeObsidian(async ({ app }, filePath) => {
			const file = app.vault.getAbstractFileByPath(filePath as string);
			if (!file) return false;
			const content = await app.vault.read(file as any);
			return content.includes('<svg') && content.includes('file-type=');
		}, filePath);

		expect(isValid).toBe(true);
	});
});
