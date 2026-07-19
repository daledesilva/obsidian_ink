import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";
import { setActivateNextEmbedInLocalStorage } from "./helpers/ink-local-storage";

const V2_DRAWING_SVG = "Ink/Drawing/v2-tldraw-drawing-tasks-priority.svg";
const V2_WRITING_SVG = "Ink/Writing/v2-tldraw-writing-llm-text.svg";
const V2_DRAWING_PRISTINE = "_test-fixtures/v2-tldraw-drawing-tasks-priority.svg";
const V2_WRITING_PRISTINE = "_test-fixtures/v2-tldraw-writing-llm-text.svg";

async function waitForPluginReady() {
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
		{ timeout: 15000 },
	);
}

async function openEditorViaFlag(notePath: string, editorSelector: string) {
	await setActivateNextEmbedInLocalStorage();
	await obsidianPage.openFile(notePath);
	const editor = await browser.$(editorSelector);
	await editor.waitForExist({ timeout: 15000 });
	await browser.pause(500);
}

async function clickLockAndWait(previewSelector: string, editorSelector: string) {
	const lockBtn = await browser.$(".ink_extended-writing-menu button");
	await lockBtn.waitForExist({ timeout: 5000 });
	await lockBtn.click();

	const preview = await browser.$(previewSelector);
	await preview.waitForExist({ timeout: 10000 });

	const editor = await browser.$(editorSelector);
	await editor.waitForExist({ reverse: true, timeout: 10000 });
}

async function resetInkSvgFromPristine(pristinePath: string, activePath: string) {
	await browser.executeObsidian(
		async ({ app }, args: { pristinePath: string; activePath: string }) => {
			const pristineFile = app.vault.getFileByPath(args.pristinePath);
			const activeFile = app.vault.getFileByPath(args.activePath);
			if (!pristineFile || !activeFile) {
				throw new Error(
					`Missing vault file: pristine=${args.pristinePath} active=${args.activePath}`,
				);
			}
			const content = await app.vault.read(pristineFile);
			await app.vault.modify(activeFile, content);
		},
		{ pristinePath, activePath },
	);
}

async function readInkSvgFromVault(vaultPath: string): Promise<string> {
	const svg = await browser.executeObsidian(async ({ app }, filePath: string) => {
		const file = app.vault.getFileByPath(filePath);
		if (!file) return null;
		return app.vault.read(file);
	}, vaultPath);
	expect(svg).not.toBeNull();
	return svg as string;
}

function expectUpgradedToInkCanvas(svg: string) {
	expect(svg).toContain("<ink-canvas version=\"0.5.0\">");
	expect(svg).not.toContain("<tldraw version=\"2.1.0\">");
}

describe("V2 Tldraw Migration — Drawing", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	it("shows locked preview", async function () {
		await obsidianPage.openFile("16 - V2 Tldraw Migration/V2 Tldraw Drawing - Preview Only.md");
		const preview = await browser.$(".ddc_ink_drawing-embed-preview");
		await preview.waitForExist({ timeout: 10000 });
	});

	describe("edit and upgrade", function () {
		beforeEach(async function () {
			await resetInkSvgFromPristine(V2_DRAWING_PRISTINE, V2_DRAWING_SVG);
		});

		it("upgrades SVG to ink-canvas on lock/save", async function () {
			await openEditorViaFlag(
				"16 - V2 Tldraw Migration/V2 Tldraw Drawing - Edit and Upgrade.md",
				".ddc_ink_drawing-editor",
			);
			await expect(await browser.$(".ddc_ink_drawing-editor")).toExist();

			await clickLockAndWait(
				".ddc_ink_drawing-embed-preview",
				".ddc_ink_drawing-editor",
			);

			await browser.pause(2000);

			const svg = await readInkSvgFromVault(V2_DRAWING_SVG);
			expectUpgradedToInkCanvas(svg);
		});
	});
});

describe("V2 Tldraw Migration — Writing", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	it("shows locked preview", async function () {
		await obsidianPage.openFile("16 - V2 Tldraw Migration/V2 Tldraw Writing - Preview Only.md");
		const preview = await browser.$(".ddc_ink_writing-embed-preview");
		await preview.waitForExist({ timeout: 10000 });
	});

	describe("edit and upgrade", function () {
		beforeEach(async function () {
			await resetInkSvgFromPristine(V2_WRITING_PRISTINE, V2_WRITING_SVG);
		});

		it("upgrades SVG to ink-canvas on lock/save", async function () {
			await openEditorViaFlag(
				"16 - V2 Tldraw Migration/V2 Tldraw Writing - Edit and Upgrade.md",
				".ddc_ink_writing-editor",
			);
			await expect(await browser.$(".ddc_ink_writing-editor")).toExist();

			await clickLockAndWait(
				".ddc_ink_writing-embed-preview",
				".ddc_ink_writing-editor",
			);

			await browser.pause(2000);

			const svg = await readInkSvgFromVault(V2_WRITING_SVG);
			expectUpgradedToInkCanvas(svg);
		});
	});
});
