import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Onboarding", function () {
  before(async function () {
    await browser.reloadObsidian({ vault: "qa-test-vault" });
    await browser.waitUntil(
      async () =>
        await browser.executeObsidian(
          ({ app }) => !!app.plugins.plugins["ink"]
        ),
      { timeout: 15000 }
    );
  });

  it("completes onboarding flow and updates settings flags", async function () {
    // Reset onboarding state and reload plugin so the welcome notice appears.
    // (reloadObsidian may reuse a vault copy with persisted plugin data)
    await browser.executeObsidian(async ({ app }) => {
      const plugin = app.plugins.plugins["ink"];
      if (plugin?.settings?.onboardingTips?.welcomeTipRead) {
        plugin.settings.onboardingTips.welcomeTipRead = false;
        plugin.settings.onboardingTips.lastVersionTipRead = "";
        await plugin.saveSettings();
      }
    });
    await obsidianPage.disablePlugin("ink");
    await obsidianPage.enablePlugin("ink");
    await browser.waitUntil(
      async () =>
        await browser.executeObsidian(
          ({ app }) => !!app.plugins.plugins["ink"]
        ),
      { timeout: 5000 }
    );

    const clickNoticeButton = async (
      selector: string,
      timeout = 5000
    ) => {
      const el = await $(selector);
      await el.waitForExist({ timeout });
      await browser.execute((sel) => {
        const btn = document.querySelector(sel);
        if (btn instanceof HTMLElement) btn.click();
      }, selector);
    };

    await clickNoticeButton(".ddc_ink_notice .ddc_ink_primary-btn", 15000);
    await clickNoticeButton(".ddc_ink_notice .ddc_ink_primary-btn");
    await clickNoticeButton(".ddc_ink_notice .ddc_ink_primary-btn");
    await clickNoticeButton(".ddc_ink_notice .ddc_ink_primary-btn");
    await clickNoticeButton(".ddc_ink_notice .ddc_ink_tertiary-btn");

    const { welcomeTipRead, lastVersionTipRead, expectedVersion } =
      await browser.executeObsidian(({ app }) => {
        const plugin = app.plugins.plugins["ink"];
        if (!plugin) {
          return {
            welcomeTipRead: false,
            lastVersionTipRead: "",
            expectedVersion: "",
          };
        }
        return {
          welcomeTipRead: plugin.settings.onboardingTips.welcomeTipRead,
          lastVersionTipRead: plugin.settings.onboardingTips.lastVersionTipRead,
          expectedVersion: plugin.manifest.version,
        };
      });

    expect(welcomeTipRead).toBe(true);
    expect(lastVersionTipRead).toBe(expectedVersion);
  });
});
