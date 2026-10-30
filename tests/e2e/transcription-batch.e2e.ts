import { browser, expect } from "@wdio/globals";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

/**
 * Settings entry for batch transcription.
 *
 * Obsidian 1.14 draws settings in the settings modal element, which is not always
 * connected to the window Webdriver queries. This talks to that element directly.
 * Confirming a scope would enqueue real portal jobs, so the test cancels.
 */

async function waitForPluginReady() {
	await browser.waitUntil(
		async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
		{ timeout: 15000 },
	);
}

describe("Batch transcribe settings", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	it("hides the batch card until an account is linked, then opens the writing scope modal", async function () {
		const result = await browser.executeObsidian(async ({ app }) => {
			const plugin = (app.plugins.plugins as any)["ink"];
			const setting = (app as any).setting;

			const waitFor = async (read: () => string, includes: string, timeoutMs = 8000) => {
				const started = Date.now();
				while (Date.now() - started < timeoutMs) {
					if (read().includes(includes)) return read();
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				return read();
			};

			const openInkTab = async (needle: string) => {
				setting.open();
				await new Promise((resolve) => setTimeout(resolve, 300));
				const inkNav = [...setting.modalEl.querySelectorAll(".vertical-tab-nav-item")]
					.find((item: Element) => item.textContent?.trim() === "Ink");
				if (inkNav instanceof HTMLElement) inkNav.click();
				else setting.openTabById("ink");
				return waitFor(() => setting.contentEl?.innerText ?? "", needle);
			};

			plugin.clearAlmostUsefulSession();
			const signedOutText = await openInkTab("Link account");
			const signedOutHasBatch = (setting.contentEl?.innerText ?? "").includes("Batch transcribe");
			setting.close();

			plugin.writeAlmostUsefulSession({
				tokenType: "almostuseful_app",
				accessToken: "t",
				refreshToken: "r",
				expiresAtEpochSeconds: 0,
				grantId: "g",
				userId: "e2e-batch",
				clientId: "ink",
				displayName: "Ink",
				userEmail: "a@b.c",
			});
			const signedInText = await openInkTab("Batch transcribe");
			const writingButton = [...setting.contentEl.querySelectorAll("button")]
				.find((candidate: Element) => candidate.textContent === "Transcribe all writing");
			if (writingButton instanceof HTMLElement) writingButton.click();

			const modalText = await waitFor(() => {
				const modal = setting.contentEl.ownerDocument.querySelector(".ddc_ink_transcription-batch-modal");
				return modal?.textContent ?? "";
			}, "Transcribe all writing", 20000);

			const modal = setting.contentEl.ownerDocument.querySelector(".ddc_ink_transcription-batch-modal");
			const cancel = [...(modal?.querySelectorAll("button") ?? [])]
				.find((candidate) => candidate.textContent === "Cancel");
			if (cancel instanceof HTMLElement) cancel.click();
			await new Promise((resolve) => setTimeout(resolve, 200));
			const modalStillOpen = !!setting.contentEl.ownerDocument.querySelector(".ddc_ink_transcription-batch-modal");

			setting.close();
			plugin.clearAlmostUsefulSession();

			return {
				signedOutHasLink: signedOutText.includes("Link account"),
				signedOutHasBatch,
				signedInHasBatch: signedInText.includes("Batch transcribe"),
				signedInHasWriting: signedInText.includes("Transcribe all writing"),
				signedInHasDrawings: signedInText.includes("Transcribe all drawings"),
				modalText,
				modalStillOpen,
			};
		});

		expect(result.signedOutHasBatch).toBe(false);
		expect(result.signedOutHasLink).toBe(true);
		expect(result.signedInHasBatch).toBe(true);
		expect(result.signedInHasWriting).toBe(true);
		expect(result.signedInHasDrawings).toBe(true);
		expect(result.modalText).toContain("Untranscribed Only");
		expect(result.modalText).toContain("Re-transcribe All");
		expect(result.modalText).toContain("Cancel");
		expect(result.modalText).toContain("no transcript yet");
		expect(result.modalStillOpen).toBe(false);
	});
});
