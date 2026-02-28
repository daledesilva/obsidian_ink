import { browser, expect } from "@wdio/globals";

describe("Ink Settings", function () {
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
