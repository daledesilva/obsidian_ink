import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

const EMBED_SELECTOR = ".ddc_ink_embed-block, .ddc_ink_widget-root";
const PREVIEW_SELECTOR = ".ddc_ink_writing-embed-preview, .ddc_ink_drawing-embed-preview";
const NOT_FOUND_BANNER = ".ddc_ink_pending-banner--not-found";
const INK_BASE_URL = "https://youtu.be/2arL1jh8ihA";

const PATH_SCENARIOS = [
	{
		id: "root",
		writing: "Ink/Writing/hello-world.svg",
		drawing: "Ink/Drawing/simple-shape.svg",
		hasLongPath: true,
		longPathWriting: "Ink/Writing/Ink/Writing/hello-world.svg",
	},
	{
		id: "note",
		writing: "16 - Copy Paste Paths/SourceFolder/Ink/Writing/note-mode-writing.svg",
		drawing: "16 - Copy Paste Paths/SourceFolder/Ink/Drawing/note-mode-drawing.svg",
		hasLongPath: false,
		longPathWriting: "",
	},
	{
		id: "obsidian-attachments",
		writing: "Attachments/Ink/Writing/obsidian-mode-writing.svg",
		drawing: "Attachments/Ink/Drawing/obsidian-mode-drawing.svg",
		hasLongPath: false,
		longPathWriting: "",
	},
];

function buildWritingEmbed(filepath: string): string {
	return `\n ![InkWriting](<${filepath}>) [Edit Writing](${INK_BASE_URL}?type=inkWriting&version=1&pendingPaste=true)\n`;
}

function buildDrawingEmbed(filepath: string): string {
	return `\n ![InkDrawing](<${filepath}>) [Edit Drawing](${INK_BASE_URL}?type=inkDrawing&version=1&width=500&aspectRatio=1.7777777777777777&viewBoxX=0&viewBoxY=0&viewBoxWidth=500&viewBoxHeight=281&pendingPaste=true)\n`;
}

async function waitForPluginReady() {
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(({ app }) => !!(app.plugins.plugins as Record<string, unknown>)["ink"]),
		{ timeout: 15000 }
	);
}

/**
 * Simulates pasting embed text into the active editor by replacing the current selection.
 * Mirrors what the paste handler does after injecting pendingPaste.
 */
async function simulatePasteEmbed(embedText: string): Promise<void> {
	await browser.executeObsidian(({ app }, text: string) => {
		const view = app.workspace.activeLeaf?.view;
		const editor = (view as { editor?: { replaceSelection: (t: string) => void } })?.editor;
		if (editor) {
			editor.replaceSelection(text);
		}
	}, embedText);
}

PATH_SCENARIOS.forEach((scenario) => {
	describe(`Embed Copy-Paste Paths — ${scenario.id}`, function () {
		before(async function () {
			await browser.reloadObsidian({ vault: "qa-test-vault" });
			await waitForPluginReady();
			await dismissBlockingPopups();
		});

		it("cross-folder paste — writing embed resolves in different folder", async function () {
			await obsidianPage.openFile("16 - Copy Paste Paths/Target Note Different Folder.md");
			await browser.pause(500);

			await simulatePasteEmbed(buildWritingEmbed(scenario.writing));
			await browser.pause(1000);

			const preview = await browser.$(PREVIEW_SELECTOR);
			await preview.waitForExist({ timeout: 10000 });
			await expect(preview).toExist();

			const notFound = await browser.$(NOT_FOUND_BANNER);
			await expect(notFound).not.toExist();
		});

		it("cross-folder paste — drawing embed resolves in different folder", async function () {
			await obsidianPage.openFile("16 - Copy Paste Paths/Target Note Different Folder.md");
			await browser.pause(500);

			await simulatePasteEmbed(buildDrawingEmbed(scenario.drawing));
			await browser.pause(1000);

			const preview = await browser.$(PREVIEW_SELECTOR);
			await preview.waitForExist({ timeout: 10000 });
			await expect(preview).toExist();

			const notFound = await browser.$(NOT_FOUND_BANNER);
			await expect(notFound).not.toExist();
		});

		it("deep nesting — embed pasted into nested target resolves", async function () {
			await obsidianPage.openFile("16 - Copy Paste Paths/Subfolder/Deep Target.md");
			await browser.pause(500);

			await simulatePasteEmbed(buildWritingEmbed(scenario.writing));
			await browser.pause(1000);

			const preview = await browser.$(PREVIEW_SELECTOR);
			await preview.waitForExist({ timeout: 10000 });
			await expect(preview).toExist();

			const notFound = await browser.$(NOT_FOUND_BANNER);
			await expect(notFound).not.toExist();
		});

		it("duplicate embed in same note — both resolve independently", async function () {
			await obsidianPage.openFile("16 - Copy Paste Paths/Target Note Different Folder.md");
			await browser.pause(500);

			await simulatePasteEmbed(buildWritingEmbed(scenario.writing));
			await simulatePasteEmbed(buildWritingEmbed(scenario.writing));
			await browser.pause(1000);

			const embeds = await browser.$$(EMBED_SELECTOR);
			expect(embeds.length).toBeGreaterThanOrEqual(2);

			const previews = await browser.$$(PREVIEW_SELECTOR);
			expect(previews.length).toBeGreaterThanOrEqual(2);
		});

		it("source from 10 - Cross-Reference pasted into 14 - Conversion Modal — resolves", async function () {
			await obsidianPage.openFile("14 - Conversion Modal/Note With Writing.md");
			await browser.pause(500);

			await simulatePasteEmbed(buildWritingEmbed(scenario.writing));
			await browser.pause(1000);

			const preview = await browser.$(PREVIEW_SELECTOR);
			await preview.waitForExist({ timeout: 10000 });
			await expect(preview).toExist();
		});

		if (scenario.hasLongPath && scenario.longPathWriting) {
			it("very long path — resolves", async function () {
				await obsidianPage.openFile("16 - Copy Paste Paths/Target Note Different Folder.md");
				await browser.pause(500);

				await simulatePasteEmbed(buildWritingEmbed(scenario.longPathWriting));
				await browser.pause(1000);

				const preview = await browser.$(PREVIEW_SELECTOR);
				await preview.waitForExist({ timeout: 10000 });
				await expect(preview).toExist();
			});
		}
	});
});

describe("Embed Copy-Paste Paths — relative path (scenario-independent)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	it("relative path — pasted into different folder shows not-found (path wrong in new context)", async function () {
		const relativeEmbed = `\n ![InkWriting](<../Ink/Writing/hello-world.svg>) [Edit Writing](${INK_BASE_URL}?type=inkWriting&version=1&pendingPaste=true)\n`;

		await obsidianPage.openFile("16 - Copy Paste Paths/Subfolder/Deep Target.md");
		await browser.pause(500);

		await simulatePasteEmbed(relativeEmbed);
		await browser.pause(1000);

		const notFound = await browser.$(NOT_FOUND_BANNER);
		await notFound.waitForExist({ timeout: 10000 });
		await expect(notFound).toExist();
	});
});
