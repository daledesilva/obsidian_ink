import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

/** Temporary: is the footer setting-item drawing its own border? */

describe("Footer border source", function () {
  before(async function () {
    await dismissBlockingPopups();
  });

  it("reports borders on the rule and the footer", async function () {
    await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
    await browser.executeObsidianCommand("ink:create-handwriting-from-photo");
    await (await $(".ddc_ink_writing-photo-batch-modal")).waitForExist({ timeout: 10000 });
    await browser.execute(() => {
      const inputEl = document.querySelector<HTMLInputElement>(".ddc_ink_writing-photo-batch-input");
      if (!inputEl) return;
      const transfer = new DataTransfer();
      for (let index = 0; index < 2; index++) {
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

    const report = await browser.execute(() => {
      const modal = document.querySelector(".modal.ddc_ink_writing-photo-batch-modal");
      const contentEl = modal ? modal.querySelector(".modal-content") : null;
      if (!contentEl) return null;
      const rules = Array.from(
        contentEl.querySelectorAll(".ddc_ink_writing-photo-batch-rule"),
      ) as HTMLElement[];
      const footer = contentEl.querySelector(
        ".ddc_ink_writing-photo-batch-footer",
      ) as HTMLElement | null;
      const read = (el: HTMLElement | null) => {
        if (!el) return null;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          top: Math.round(rect.top),
          height: Math.round(rect.height),
          borderTopWidth: style.borderTopWidth,
          borderTopStyle: style.borderTopStyle,
          borderTopColor: style.borderTopColor,
          boxShadow: style.boxShadow,
        };
      };
      return {
        ruleCount: rules.length,
        rules: rules.map((rule) => read(rule)),
        footer: read(footer),
        // The footer's previous sibling is the bottom rule, so the two lines sit adjacent.
        footerPreviousSiblingClass: footer?.previousElementSibling?.className ?? null,
      };
    });
    console.log("BORDER_SOURCES", JSON.stringify(report, null, 2));
    expect(report).not.toBeNull();
  });
});
