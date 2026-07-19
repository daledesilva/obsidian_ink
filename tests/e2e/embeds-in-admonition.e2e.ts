import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

const EMBED_SELECTOR = ".ddc_ink_embed-block, .ddc_ink_widget-root";
const ADMONITION_PAGE =
  "04b - Callouts and Layout Containers/In Admonition - Code Blocks.md";

// NOTE: These tests open a page that uses Admonition code-fence syntax
// (```ad-note, ```ad-tip). The Admonition community plugin must be installed
// and enabled in the test vault for the blocks to render as styled containers.
// Run `npm run download-test-plugins` before these tests to install it.
//
// SKIP: Ink embeds inside Admonition code blocks do not render because the
// content is parsed as code, not markdown. CodeMirror extensions only process
// markdown syntax; content inside fenced code blocks is opaque to the parser.

describe("Embeds in Admonition Code Blocks", function () {
  before(async function () {
    await browser.reloadObsidian({ vault: "qa-test-vault" });
    await browser.waitUntil(
      async () =>
        browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
      { timeout: 15000 }
    );
    await dismissBlockingPopups();
  });

  it("renders both writing and drawing embeds inside admonition blocks", async function () {
    await obsidianPage.openFile(ADMONITION_PAGE);
    // Admonition blocks and Ink embeds render asynchronously; wait for them.
    await browser.waitUntil(
      async () => (await $$(EMBED_SELECTOR)).length >= 2,
      { timeout: 10000, interval: 250 }
    );
    const embeds = await $$(EMBED_SELECTOR);
    // Page has one writing embed (ad-note) and one drawing embed (ad-tip)
    expect(embeds.length).toBeGreaterThanOrEqual(2);
  });

  it("each embed fits within its admonition content container and does not overflow", async function () {
    await obsidianPage.openFile(ADMONITION_PAGE);
    await browser.waitUntil(
      async () => (await $$(EMBED_SELECTOR)).length >= 2,
      { timeout: 10000, interval: 250 }
    );
    const embeds = await $$(EMBED_SELECTOR);
    for (const embed of embeds) {
      const overflow = await browser.execute((el: Element) => {
        // Admonition plugin wraps content in .admonition-content (or similar)
        const parent =
          el.closest(".admonition-content") ??
          el.closest(".admonition") ??
          el.parentElement;
        if (!parent) return false;
        const eRect = el.getBoundingClientRect();
        const pRect = parent.getBoundingClientRect();
        return eRect.right > pRect.right + 2;
      }, embed);
      expect(overflow).toBe(false);
    }
  });

});
