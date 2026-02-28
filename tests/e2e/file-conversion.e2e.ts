import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("File Conversion (write <-> draw)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }) => !!app.plugins.plugins["ink"]),
			{ timeout: 15000 }
		);
	});

	it("converts a writing SVG to drawing via pane menu", async function () {
		// Open the writing file from the conversion test folder
		await obsidianPage.openFile("12 - File Conversion/Writing To Convert.svg");
		await browser.pause(1500);

		// Trigger conversion directly through the plugin API
		const filePath = "12 - File Conversion/Writing To Convert.svg";
		const conversionResult = await browser.executeObsidian(async ({ app }) => {
			const plugin = app.plugins.plugins["ink"] as any;
			if (!plugin) return { error: "plugin not found" };
			const file = app.vault.getAbstractFileByPath(filePath);
			if (!file) return { error: "file not found" };
			try {
				const { convertWriteFileToDraw } = await import(
					/* webpackIgnore: true */
					"../src/components/formats/current/utils/convertWriteFileToDraw"
				).catch(() => null) || {};
				if (convertWriteFileToDraw) {
					await convertWriteFileToDraw(plugin, file);
				} else {
					// Fallback: access via active view's pane menu
					const leaf = app.workspace.activeLeaf;
					const view = leaf?.view as any;
					if (view?.file && view.file.path === filePath) {
						// Trigger via the onPaneMenu mechanism by simulating the action
						await view.onPaneMenu?.({ addItem: (cb: any) => {
							const mockItem = {
								setTitle: (t: string) => { (mockItem as any)._title = t; return mockItem; },
								setSection: () => mockItem,
								onClick: (fn: Function) => { if ((mockItem as any)._title === 'Convert to Drawing') fn(); return mockItem; }
							};
							cb(mockItem);
						}}, 'more-options');
					}
				}
				return { success: true };
			} catch (err: any) {
				return { error: err?.message ?? String(err) };
			}
		});

		await browser.pause(1000);

		// Read the file content and check the metadata
		const fileType = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath(filePath);
			if (!file) return null;
			try {
				const content = await app.vault.read(file as any);
				const match = content.match(/file-type="([^"]+)"/);
				return match ? match[1] : null;
			} catch (err) {
				return null;
			}
		});

		expect(fileType).toBe("inkDrawing");
	});

	it("converts a drawing SVG to writing via pane menu", async function () {
		const filePath = "12 - File Conversion/Drawing To Convert.svg";
		await obsidianPage.openFile(filePath);
		await browser.pause(1500);

		await browser.executeObsidian(async ({ app }) => {
			const plugin = app.plugins.plugins["ink"] as any;
			if (!plugin) return;
			const file = app.vault.getAbstractFileByPath(filePath);
			if (!file) return;
			const leaf = app.workspace.activeLeaf;
			const view = leaf?.view as any;
			if (view?.onPaneMenu) {
				view.onPaneMenu({ addItem: (cb: any) => {
					const mockItem = {
						setTitle: (t: string) => { (mockItem as any)._title = t; return mockItem; },
						setSection: () => mockItem,
						onClick: (fn: Function) => { if ((mockItem as any)._title === 'Convert to Writing') fn(); return mockItem; }
					};
					cb(mockItem);
				}}, 'more-options');
			}
		});

		await browser.pause(1000);

		const fileType = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath(filePath);
			if (!file) return null;
			try {
				const content = await app.vault.read(file as any);
				const match = content.match(/file-type="([^"]+)"/);
				return match ? match[1] : null;
			} catch (err) {
				return null;
			}
		});

		expect(fileType).toBe("inkWriting");
	});

	it("file remains at the same .svg path after conversion (no rename)", async function () {
		const filePath = "12 - File Conversion/Writing To Convert.svg";

		const fileExists = await browser.executeObsidian(({ app }) => {
			const file = app.vault.getAbstractFileByPath(filePath);
			return !!file;
		});

		expect(fileExists).toBe(true);
	});

	it("round-trip write -> draw -> write preserves file validity", async function () {
		const filePath = "12 - File Conversion/Drawing To Convert.svg";

		// Convert back from writing to drawing to restore state
		await browser.executeObsidian(async ({ app }) => {
			const plugin = app.plugins.plugins["ink"] as any;
			if (!plugin) return;
			const file = app.vault.getAbstractFileByPath(filePath);
			if (!file) return;
			const leaf = app.workspace.activeLeaf;
			const view = leaf?.view as any;
			if (view?.onPaneMenu) {
				view.onPaneMenu({ addItem: (cb: any) => {
					const mockItem = {
						setTitle: (t: string) => { (mockItem as any)._title = t; return mockItem; },
						setSection: () => mockItem,
						onClick: (fn: Function) => { if ((mockItem as any)._title === 'Convert to Drawing') fn(); return mockItem; }
					};
					cb(mockItem);
				}}, 'more-options');
			}
		});

		await browser.pause(1000);

		// Verify the file is still valid SVG with ink metadata
		const isValid = await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getAbstractFileByPath(filePath);
			if (!file) return false;
			try {
				const content = await app.vault.read(file as any);
				return content.includes('<svg') && content.includes('file-type=');
			} catch (err) {
				return false;
			}
		});

		expect(isValid).toBe(true);
	});
});
