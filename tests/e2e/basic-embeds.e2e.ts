import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

const EMBED_SELECTOR = ".ddc_ink_embed-block, .ddc_ink_widget-root";

describe("Basic Embeds", function () {
  before(async function () {
    await dismissBlockingPopups();
  });

  it("renders writing embed in Single Writing Embed note", async function () {
    await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");

    const embed = await $(EMBED_SELECTOR);
    await embed.waitForExist({ timeout: 10000 });
    await expect(embed).toExist();
  });

  it("renders drawing embed in Single Drawing Embed note", async function () {
    await obsidianPage.openFile("01 - Basic Embeds/Single Drawing Embed.md");

    const embed = await $(EMBED_SELECTOR);
    await embed.waitForExist({ timeout: 10000 });
    await expect(embed).toExist();
  });

  it("renders multiple embeds in Mixed note", async function () {
    await obsidianPage.openFile("01 - Basic Embeds/Mixed Writing and Drawing.md");

    const embed = await $(EMBED_SELECTOR);
    await embed.waitForExist({ timeout: 10000 });
    const embeds = await $$(EMBED_SELECTOR);
    expect(embeds.length).toBeGreaterThanOrEqual(2);
  });
});
