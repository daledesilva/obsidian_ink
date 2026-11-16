import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

/** Temporary: find every rule in the batch modal, with positions and classes. */

describe("Batch modal rules", function () {
  before(async function () {
    await dismissBlockingPopups();
  });

  it("lists all rules with positions, before and after photos exist", async function () {
    await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
    await browser.executeObsidianCommand("ink:create-handwriting-from-photo");
    await (await $(".ddc_ink_writing-photo-batch-modal")).waitForExist({ timeout: 10000 });
    await browser.pause(600);

    const listRules = async () =>
      browser.execute(() => {
        const modal = document.querySelector(".modal.ddc_ink_writing-photo-batch-modal");
        const contentEl = modal ? modal.querySelector(".modal-content") : null;
        if (!modal || !contentEl) return null;
        const found: {
          cls: string;
          tag: string;
          top: number;
          width: number;
          height: number;
        }[] = [];
        for (const el of Array.from(contentEl.querySelectorAll("*"))) {
          const htmlEl = el as HTMLElement;
          const style = getComputedStyle(htmlEl);
          const rect = htmlEl.getBoundingClientRect();
          if (rect.width < 150) continue;
          const hasBorderTop = parseFloat(style.borderTopWidth) > 0;
          const hasOutline = parseFloat(style.outlineWidth) > 0;
          const isHr = htmlEl.tagName === 'HR';
          if (!hasBorderTop && !hasOutline && !isHr) continue;
          found.push({
            cls: htmlEl.className?.toString().slice(0, 50) ?? '',
            tag: htmlEl.tagName,
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
        const sourceGrid = contentEl.querySelector(".ddc_ink_photo-source-grid");
        const footer = contentEl.querySelector(".ddc_ink_writing-photo-batch-footer");
        return {
          rules: found.sort((a, b) => a.top - b.top),
          sourceGridBottom: sourceGrid
            ? Math.round(sourceGrid.getBoundingClientRect().bottom)
            : null,
          footerTop: footer ? Math.round(footer.getBoundingClientRect().top) : null,
        };
      });

    const emptyState = await listRules();
    console.log("EMPTY_RULES", JSON.stringify(emptyState, null, 2));

    await browser.execute(() => {
      const inputEl = document.querySelector<HTMLInputElement>(".ddc_ink_writing-photo-batch-input");
      if (!inputEl) return;
      const transfer = new DataTransfer();
      for (let index = 0; index < 3; index++) {
        const canvas = document.createElement("canvas");
        canvas.width = 300;
        canvas.height = 400;
        const dataUrl = canvas.toDataURL("image/png");
        const binary = atob(dataUrl.split(",")[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        transfer.items.add(new File([bytes], `p-${index}.png`, { type: "image/png" }));
      }
      inputEl.files = transfer.files;
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await browser.pause(2200);

    const populated = await listRules();
    console.log("POPULATED_RULES", JSON.stringify(populated, null, 2));
    expect(populated).not.toBeNull();
    await browser.saveScreenshot("/tmp/ink-batch-rules.png");
  });
});
