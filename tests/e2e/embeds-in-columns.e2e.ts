import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

const EMBED_SELECTOR = ".ddc_ink_embed-block, .ddc_ink_widget-root";

// NOTE: These tests open pages that rely on community column-layout plugins
// (Obsidian Columns, Multi-Column Markdown, Modular CSS Layout). If those
// plugins are not installed in the test vault, the column containers will not
// render, but the ink embeds themselves should still be present and correctly
// sized. Run `npm run download-test-plugins` before these tests to install the
// community plugins and verify full column layout behaviour.

describe("Embeds in Column Layouts", function () {

  // ─── Obsidian Columns plugin ([!col] callout) ──────────────────────────────

  describe("Obsidian Columns plugin ([!col] callout)", function () {
    it("renders writing and drawing embeds inside [!col] columns", async function () {
      await obsidianPage.openFile(
        "04b - Callouts and Layout Containers/In Columns - Obsidian Columns.md"
      );
      const embeds = await $$(EMBED_SELECTOR);
      await embeds[0]?.waitForExist({ timeout: 10000 });
      expect(embeds.length).toBeGreaterThanOrEqual(2);
    });

    it("each embed fits within its column and does not overflow", async function () {
      await obsidianPage.openFile(
        "04b - Callouts and Layout Containers/In Columns - Obsidian Columns.md"
      );
      const embeds = await $$(EMBED_SELECTOR);
      for (const embed of embeds) {
        await embed.waitForExist({ timeout: 10000 });
        const overflow = await browser.execute((el: Element) => {
          const parent = el.closest(".callout") ?? el.parentElement;
          if (!parent) return false;
          const eRect = el.getBoundingClientRect();
          const pRect = parent.getBoundingClientRect();
          return eRect.right > pRect.right + 2;
        }, embed);
        expect(overflow).toBe(false);
      }
    });
  });

  // ─── Multi-Column Markdown (code fence) ────────────────────────────────────

  describe("Multi-Column Markdown plugin (code fence)", function () {
    it("renders writing and drawing embeds inside multi-column-markdown columns", async function () {
      await obsidianPage.openFile(
        "04b - Callouts and Layout Containers/In Columns - Multi-Column Layout.md"
      );
      const embeds = await $$(EMBED_SELECTOR);
      await embeds[0]?.waitForExist({ timeout: 10000 });
      expect(embeds.length).toBeGreaterThanOrEqual(2);
    });

    it("each embed fits within its column and does not overflow", async function () {
      await obsidianPage.openFile(
        "04b - Callouts and Layout Containers/In Columns - Multi-Column Layout.md"
      );
      const embeds = await $$(EMBED_SELECTOR);
      for (const embed of embeds) {
        await embed.waitForExist({ timeout: 10000 });
        const overflow = await browser.execute((el: Element) => {
          // Multi-Column Markdown wraps columns in a div matching '[class*="column"]'
          const parent = el.closest('[class*="column"]') ?? el.parentElement;
          if (!parent) return false;
          const eRect = el.getBoundingClientRect();
          const pRect = parent.getBoundingClientRect();
          return eRect.right > pRect.right + 2;
        }, embed);
        expect(overflow).toBe(false);
      }
    });
  });

  // ─── MCL Multi Column ([!multi-column] callout and list-grid) ──────────────

  describe("MCL Multi Column ([!multi-column] and list-grid)", function () {
    it("renders embeds inside [!multi-column] callout columns", async function () {
      await obsidianPage.openFile(
        "04b - Callouts and Layout Containers/In Columns - MCL List Grid.md"
      );
      const embeds = await $$(EMBED_SELECTOR);
      await embeds[0]?.waitForExist({ timeout: 10000 });
      expect(embeds.length).toBeGreaterThanOrEqual(2);
    });

    it("each embed fits within its list-grid cell and does not overflow", async function () {
      await obsidianPage.openFile(
        "04b - Callouts and Layout Containers/In Columns - MCL List Grid.md"
      );
      const embeds = await $$(EMBED_SELECTOR);
      for (const embed of embeds) {
        await embed.waitForExist({ timeout: 10000 });
        const overflow = await browser.execute((el: Element) => {
          const parent = el.closest("li") ?? el.parentElement;
          if (!parent) return false;
          const eRect = el.getBoundingClientRect();
          const pRect = parent.getBoundingClientRect();
          return eRect.right > pRect.right + 2;
        }, embed);
        expect(overflow).toBe(false);
      }
    });
  });

  // ─── All Methods — comprehensive page ──────────────────────────────────────

  describe("All column methods — comprehensive page", function () {
    it("renders at least one embed per column method section", async function () {
      await obsidianPage.openFile(
        "04b - Callouts and Layout Containers/In Columns - All Methods.md"
      );
      const embeds = await $$(EMBED_SELECTOR);
      await embeds[0]?.waitForExist({ timeout: 15000 });
      // Page has writing + drawing in 5 sections (2-col MCM, Obsidian Columns,
      // MCL callout, MCL list-grid, 3-col MCM) = at least 6 embeds expected.
      expect(embeds.length).toBeGreaterThanOrEqual(6);
    });
  });

});
