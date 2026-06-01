import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

const BULK_DRAWING_SVG = "Ink/Drawing/bulk-tldraw-drawing.svg";
const BULK_WRITING_SVG = "Ink/Writing/bulk-tldraw-writing.svg";
const BULK_DRAWING_PRISTINE = "_test-fixtures/bulk-tldraw-drawing.svg";
const BULK_WRITING_PRISTINE = "_test-fixtures/bulk-tldraw-writing.svg";

async function waitForPluginReady() {
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
		{ timeout: 15000 },
	);
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
	expect(svg).toContain('<ink-canvas version="0.5.0">');
	expect(svg).not.toContain('<tldraw version="2.1.0">');
}

async function clickModalMigrateButton() {
	await browser.waitUntil(
		async () => {
			const buttons = await browser.$$(".modal-container button");
			for (const btn of buttons) {
				const text = await btn.getText();
				if (text.trim() === "Migrate") return true;
			}
			return false;
		},
		{ timeout: 15000 },
	);

	await browser.execute(() => {
		const buttons = document.querySelectorAll(".modal-container button");
		for (const btn of buttons) {
			if (btn.textContent?.trim() === "Migrate") {
				(btn as HTMLElement).click();
				break;
			}
		}
	});
}

async function waitForMigrationDone() {
	await browser.waitUntil(
		async () => {
			const text = await browser.execute(() => {
				const modal = document.querySelector(".modal-container");
				return modal?.textContent ?? "";
			});
			return text.includes("Migration complete");
		},
		{ timeout: 60000 },
	);
}

describe("Tldraw SVG bulk migration modal", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	beforeEach(async function () {
		await resetInkSvgFromPristine(BULK_DRAWING_PRISTINE, BULK_DRAWING_SVG);
		await resetInkSvgFromPristine(BULK_WRITING_PRISTINE, BULK_WRITING_SVG);
	});

	it("shows locked drawing preview before migration", async function () {
		await obsidianPage.openFile("17 - Tldraw Bulk Migration/Bulk Drawing - Before.md");
		const preview = await browser.$(".ddc_ink_drawing-embed-preview");
		await preview.waitForExist({ timeout: 10000 });
	});

	it("bulk migration modal converts tldraw SVGs to ink-canvas", async function () {
		await browser.executeObsidian(({ app }) => {
			(app.plugins.plugins["ink"] as { openTldrawSvgMigrationModal: () => void })
				.openTldrawSvgMigrationModal();
		});
		await browser.pause(500);

		const modal = await browser.$(".modal-container");
		await modal.waitForExist({ timeout: 5000 });

		await browser.waitUntil(
			async () => {
				const text = await browser.execute(() => {
					const el = document.querySelector(".modal-container");
					return el?.textContent ?? "";
				});
				return text.includes("Migrate") && !text.includes("Scanning vault");
			},
			{ timeout: 30000 },
		);

		await clickModalMigrateButton();
		await waitForMigrationDone();

		const drawingSvg = await readInkSvgFromVault(BULK_DRAWING_SVG);
		expectUpgradedToInkCanvas(drawingSvg);

		const writingSvg = await readInkSvgFromVault(BULK_WRITING_SVG);
		expectUpgradedToInkCanvas(writingSvg);
	});

	it("drawing note embed has non-default viewBox after bulk migration", async function () {
		await browser.executeObsidian(({ app }) => {
			(app.plugins.plugins["ink"] as { openTldrawSvgMigrationModal: () => void })
				.openTldrawSvgMigrationModal();
		});
		await browser.pause(500);

		await browser.waitUntil(
			async () => {
				const text = await browser.execute(() => {
					const el = document.querySelector(".modal-container");
					return el?.textContent ?? "";
				});
				return text.includes("Migrate") && !text.includes("Scanning vault");
			},
			{ timeout: 30000 },
		);

		await clickModalMigrateButton();
		await waitForMigrationDone();

		const noteContent = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getFileByPath(
				"17 - Tldraw Bulk Migration/Bulk Drawing - Before.md",
			);
			if (!file) return "";
			return app.vault.read(file);
		});

		expect(noteContent).toContain("viewBoxX=");
		expect(noteContent).not.toMatch(/viewBoxX=0&viewBoxY=0&viewBoxW=500&viewBoxH=281/);
	});
});
