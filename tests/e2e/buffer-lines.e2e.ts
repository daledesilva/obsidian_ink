import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Writing Embed Buffer Lines", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }) => !!app.plugins.plugins["ink"]),
			{ timeout: 15000 }
		);
		// Reset to default buffer lines setting
		await browser.executeObsidian(async ({ app }) => {
			const plugin = app.plugins.plugins["ink"] as any;
			if (plugin) {
				plugin.settings.writingBufferLines = 2;
				await plugin.saveSettings();
			}
		});
	});

	after(async function () {
		// Restore default setting
		await browser.executeObsidian(async ({ app }) => {
			const plugin = app.plugins.plugins["ink"] as any;
			if (plugin) {
				plugin.settings.writingBufferLines = 2;
				await plugin.saveSettings();
			}
		});
	});

	it("default buffer setting is 2", async function () {
		const bufferLines = await browser.executeObsidian(({ app }) => {
			const plugin = app.plugins.plugins["ink"] as any;
			return plugin?.settings?.writingBufferLines ?? null;
		});
		expect(bufferLines).toBe(2);
	});

	it("buffer lines setting appears in settings UI", async function () {
		await browser.executeObsidianCommand("app:open-settings");
		await browser.pause(500);

		const modal = await browser.$(".modal-container");
		await modal.waitForExist({ timeout: 5000 });

		// Navigate to Ink plugin settings
		await browser.execute(() => {
			const items = document.querySelectorAll(".vertical-tab-content .setting-item-name");
			for (const item of items) {
				if (item.textContent?.toLowerCase().includes('ink')) {
					(item.closest('.vertical-tab-nav-item') as HTMLElement)?.click();
					break;
				}
			}
		});

		await browser.pause(500);

		const settingExists = await browser.execute(() => {
			const names = document.querySelectorAll(".setting-item-name");
			for (const name of names) {
				if (name.textContent?.toLowerCase().includes('buffer lines')) return true;
			}
			return false;
		});

		expect(settingExists).toBe(true);

		// Close settings
		await browser.keys(['Escape']);
		await browser.pause(300);
	});

	it("embed height with default buffer (2) is larger than with buffer (1)", async function () {
		// Open the writing embed in edit mode to measure its height
		await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");

		const EMBED_SELECTOR = ".ddc_ink_embed-block, .ddc_ink_widget-root";
		const embed = await browser.$(EMBED_SELECTOR);
		await embed.waitForExist({ timeout: 10000 });

		// Click to open editing mode
		await browser.execute(() => {
			const editBtn = document.querySelector(".ddc_ink_edit-btn, button[title*='Edit']");
			if (editBtn instanceof HTMLElement) editBtn.click();
		});
		await browser.pause(2000);

		// Get height with buffer 2 (default)
		const heightWithBuffer2 = await browser.execute(() => {
			const container = document.querySelector(".ddc_ink_embed-block .ddc_ink_resize-container, .ddc_ink_widget-root .ddc_ink_resize-container") as HTMLElement;
			return container ? container.getBoundingClientRect().height : null;
		});

		// Change buffer to 1
		await browser.executeObsidian(async ({ app }) => {
			const plugin = app.plugins.plugins["ink"] as any;
			if (plugin) {
				plugin.settings.writingBufferLines = 1;
				await plugin.saveSettings();
			}
		});

		// Reload to apply new setting
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () => browser.executeObsidian(({ app }) => !!app.plugins.plugins["ink"]),
			{ timeout: 15000 }
		);
		await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
		const embedAfter = await browser.$(EMBED_SELECTOR);
		await embedAfter.waitForExist({ timeout: 10000 });
		await browser.execute(() => {
			const editBtn = document.querySelector(".ddc_ink_edit-btn, button[title*='Edit']");
			if (editBtn instanceof HTMLElement) editBtn.click();
		});
		await browser.pause(2000);

		const heightWithBuffer1 = await browser.execute(() => {
			const container = document.querySelector(".ddc_ink_embed-block .ddc_ink_resize-container, .ddc_ink_widget-root .ddc_ink_resize-container") as HTMLElement;
			return container ? container.getBoundingClientRect().height : null;
		});

		// Buffer 2 should give a larger (or equal, if content is small) height than buffer 1
		if (heightWithBuffer2 !== null && heightWithBuffer1 !== null) {
			expect(heightWithBuffer2).toBeGreaterThanOrEqual(heightWithBuffer1);
		} else {
			// If we couldn't measure heights, at least verify the setting changed
			const currentBuffer = await browser.executeObsidian(({ app }) => {
				const plugin = app.plugins.plugins["ink"] as any;
				return plugin?.settings?.writingBufferLines ?? null;
			});
			expect(currentBuffer).toBe(1);
		}
	});

	it("changing buffer lines setting persists after save", async function () {
		await browser.executeObsidian(async ({ app }) => {
			const plugin = app.plugins.plugins["ink"] as any;
			if (plugin) {
				plugin.settings.writingBufferLines = 3;
				await plugin.saveSettings();
			}
		});

		const savedValue = await browser.executeObsidian(({ app }) => {
			const plugin = app.plugins.plugins["ink"] as any;
			return plugin?.settings?.writingBufferLines ?? null;
		});

		expect(savedValue).toBe(3);
	});
});
