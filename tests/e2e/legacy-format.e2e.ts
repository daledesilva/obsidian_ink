import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

describe("Legacy Format (v1)", function () {
  before(async function () {
    await dismissBlockingPopups();
  });

  it("renders v1 writing embed", async function () {
    await obsidianPage.openFile("02 - Legacy Format/V1 Writing Embed.md");

    const embed = await browser.$(".ddc_ink_writing-embed-preview");
    await expect(embed).toExist();
  });

  it("renders v1 drawing embed", async function () {
    await obsidianPage.openFile("02 - Legacy Format/V1 Drawing Embed.md");

    const embed = await browser.$(".ddc_ink_drawing-embed-preview");
    await expect(embed).toExist();
  });

  it("renders v1 and v2 embeds side by side", async function () {
    await obsidianPage.openFile("02 - Legacy Format/V1 and V2 Side by Side.md");

    const v1Writing = await browser.$(".ddc_ink_writing-embed-preview");
    const v2Writing = await browser.$(".ddc_ink_embed-block");
    await expect(v1Writing).toExist();
    await expect(v2Writing).toExist();
  });
});
