import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

/** Temporary: exactly one divider above the footer, and one above the thumbnails. */

async function addPhotos(count: number): Promise<void> {
  await browser.execute((photoCount: number) => {
    const inputEl = document.querySelector<HTMLInputElement>(".ddc_ink_writing-photo-batch-input");
    if (!inputEl) return;
    const transfer = new DataTransfer();
    for (let index = 0; index < photoCount; index++) {
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
  }, count);
  await browser.pause(2200);
}

async function lines() {
  return browser.execute(() => {
    const modal = document.querySelector(".modal.ddc_ink_writing-photo-batch-modal");
    const contentEl = modal ? modal.querySelector(".modal-content") : null;
    if (!contentEl) return null;
    const drawn: { cls: string; top: number }[] = [];
    for (const el of Array.from(contentEl.querySelectorAll("*"))) {
      const htmlEl = el as HTMLElement;
      const style = getComputedStyle(htmlEl);
      const rect = htmlEl.getBoundingClientRect();
      if (rect.width < 150) continue;
      if (parseFloat(style.borderTopWidth) <= 0) continue;
      drawn.push({ cls: htmlEl.className?.toString().slice(0, 55) ?? '', top: Math.round(rect.top) });
    }
    drawn.sort((a, b) => a.top - b.top);
    const footer = contentEl.querySelector(
      ".ddc_ink_writing-photo-batch-footer",
    ) as HTMLElement | null;
    const sourceGrid = contentEl.querySelector(
      ".ddc_ink_photo-source-grid",
    ) as HTMLElement | null;
    const footerTop = footer ? Math.round(footer.getBoundingClientRect().top) : null;
    const sourceBottom = sourceGrid ? Math.round(sourceGrid.getBoundingClientRect().bottom) : null;
    return {
      drawn,
      footerTop,
      sourceBottom,
      // Anything between the source cards and the footer is the suspect duplicate.
      betweenSourceAndFooter: drawn.filter(
        (d) => sourceBottom != null && footerTop != null && d.top > sourceBottom && d.top < footerTop,
      ),
      ruleDivCount: contentEl.querySelectorAll('.ddc_ink_writing-photo-batch-rule').length,
    };
  });
}

describe("Single divider above the footer", function () {
  before(async function () {
    await dismissBlockingPopups();
  });

  it("draws exactly one line before the footer, with no stacked duplicate", async function () {
    await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
    await browser.executeObsidianCommand("ink:create-handwriting-from-photo");
    await (await $(".ddc_ink_writing-photo-batch-modal")).waitForExist({ timeout: 10000 });
    await browser.pause(500);
    await addPhotos(2);

    const report = await lines();
    console.log("LINES", JSON.stringify(report, null, 2));

    expect(report).not.toBeNull();
    // Only the thumbnails rule remains as a manual div; the footer divider is Obsidian's.
    expect(report!.ruleDivCount).toBe(1);
    expect(report!.betweenSourceAndFooter).toEqual([]);
    // The footer still has exactly one divider of its own.
    const footerLines = report!.drawn.filter((d) => d.cls.includes("footer"));
    expect(footerLines.length).toBe(1);
    await browser.saveScreenshot("/tmp/ink-single-rule.png");
  });
});
