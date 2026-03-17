import { browser } from "@wdio/globals";

/**
 * Dismisses blocking popups that can interfere with e2e tests.
 * Both Ink and Excalidraw are pre-seeded in generate.mjs, so popups normally do not appear.
 * This helper is a fallback for edge cases (e.g. Ink welcome if pre-seed ever fails).
 *
 * Call this after reloadObsidian and waitForPluginReady in before hooks.
 * Idempotent: if no popup is visible, does nothing.
 */
export async function dismissBlockingPopups(): Promise<void> {
  await browser.pause(500);

  const dismissed = await browser.execute(() => {
    const inkNotice = document.querySelector(".ddc_ink_notice");
    if (inkNotice) {
      const remindBtn = inkNotice.querySelector(".ddc_ink_tertiary-btn");
      if (remindBtn instanceof HTMLElement) {
        remindBtn.click();
        return true;
      }
    }
    return false;
  });

  if (dismissed) {
    await browser.pause(300);
  }
}
