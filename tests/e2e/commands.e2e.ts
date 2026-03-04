import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

describe("Ink Plugin Commands", function () {
  before(async function () {
    await dismissBlockingPopups();
  });

  it("plugin is loaded", async function () {
    const pluginLoaded = await browser.executeObsidian(({ app }) => {
      return !!app.plugins.plugins["ink"];
    });
    expect(pluginLoaded).toBe(true);
  });

  it("create-handwritten-section inserts embed when editor is focused", async function () {
    await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");

    await browser.executeObsidianCommand("ink:create-handwritten-section");

    const embed = await $(".ddc_ink_embed-block, .ddc_ink_widget-root");
    await embed.waitForExist({ timeout: 10000 });
    const embeds = await $$(".ddc_ink_embed-block, .ddc_ink_widget-root");
    expect(embeds.length).toBeGreaterThanOrEqual(2);
  });
});
