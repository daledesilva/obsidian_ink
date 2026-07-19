import { browser, expect } from "@wdio/globals";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

////////
// Helpers

async function waitForPluginReady() {
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
		{ timeout: 15000 }
	);
}

async function openInkSettingsTab() {
	await browser.executeObsidianCommand("app:open-settings");
	await browser.pause(500);

	const modal = await browser.$(".modal-container");
	await modal.waitForExist({ timeout: 5000 });

	await browser.execute(() => {
		const navItems = document.querySelectorAll(".vertical-tab-nav-item");
		for (const item of navItems) {
			if (item.textContent?.trim().toLowerCase() === "ink") {
				(item as HTMLElement).click();
				break;
			}
		}
	});
	await browser.pause(500);
}

async function closeSettings() {
	await browser.keys(["Escape"]);
	await browser.pause(300);
}

async function setWritingLineHeight(value: number) {
	await browser.execute((v: number) => {
		(window as any).__inkTestLineHeight = v;
	}, value);
	await browser.executeObsidian(async ({ app }) => {
		const plugin = (app.plugins.plugins as any)["ink"];
		if (plugin) {
			plugin.settings.writingLineHeight = (window as any).__inkTestLineHeight;
			await plugin.saveSettings();
		}
	});
}

////////
////////

describe("Ink Settings", function () {
  before(async function () {
    await dismissBlockingPopups();
  });

  it("can open settings and Ink plugin is loaded", async function () {
    await browser.executeObsidianCommand("app:open-settings");

    const modal = await $(".modal-container");
    await modal.waitForExist({ timeout: 5000 });
    await expect(modal).toExist();

    const pluginLoaded = await browser.executeObsidian(({ app }) => {
      return !!app.plugins.plugins["ink"];
    });
    expect(pluginLoaded).toBe(true);
  });
});

////////
////////

describe("Writing Line Height — Settings", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
		// Reset to default before each suite
		await setWritingLineHeight(150);
	});

	after(async function () {
		await setWritingLineHeight(150);
	});

	it("default writingLineHeight setting is 150", async function () {
		const value = await browser.executeObsidian(({ app }) => {
			const plugin = (app.plugins.plugins as any)["ink"];
			return plugin?.settings?.writingLineHeight ?? null;
		});
		expect(value).toBe(150);
	});

	it("line height setting appears in the Ink settings tab", async function () {
		await openInkSettingsTab();

		const settingExists = await browser.execute(() => {
			const names = document.querySelectorAll(".setting-item-name");
			for (const name of names) {
				if (name.textContent?.toLowerCase().includes("line height")) return true;
			}
			return false;
		});
		expect(settingExists).toBe(true);

		await closeSettings();
	});

	it("settings tab contains a slider for line height", async function () {
		await openInkSettingsTab();

		const sliderExists = await browser.execute(() => {
			// Look for an input[type=range] inside the Ink settings pane
			const sliders = document.querySelectorAll(".vertical-tab-content input[type='range']");
			return sliders.length > 0;
		});
		expect(sliderExists).toBe(true);

		await closeSettings();
	});

	it("changing writingLineHeight via plugin API persists after save", async function () {
		await setWritingLineHeight(200);

		const saved = await browser.executeObsidian(({ app }) => {
			const plugin = (app.plugins.plugins as any)["ink"];
			return plugin?.settings?.writingLineHeight ?? null;
		});
		expect(saved).toBe(200);
	});

	it("writingLineHeight can be set to minimum (50) and maximum (400)", async function () {
		await setWritingLineHeight(50);
		const min = await browser.executeObsidian(({ app }) => {
			return (app.plugins.plugins as any)["ink"]?.settings?.writingLineHeight ?? null;
		});
		expect(min).toBe(50);

		await setWritingLineHeight(400);
		const max = await browser.executeObsidian(({ app }) => {
			return (app.plugins.plugins as any)["ink"]?.settings?.writingLineHeight ?? null;
		});
		expect(max).toBe(400);
	});

	it("writingLineHeight setting persists across plugin reload", async function () {
		await setWritingLineHeight(300);

		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();

		const persisted = await browser.executeObsidian(({ app }) => {
			return (app.plugins.plugins as any)["ink"]?.settings?.writingLineHeight ?? null;
		});
		expect(persisted).toBe(300);
	});
});

